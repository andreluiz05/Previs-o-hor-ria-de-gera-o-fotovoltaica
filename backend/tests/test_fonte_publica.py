import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import Mock

import requests

from fonte_publica import MonitorPublico, NODE_ID, SOURCE_ID


class FontePublicaTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = Path(self.tmp.name) / 'fonte.sqlite3'
        self.now = datetime(2026, 11, 27, 12, 35, tzinfo=timezone.utc)
        self.cliente = Mock()
        self.cliente.ultima.return_value = self.row('2026-11-27T12:30:00Z', watts=114, wattHours=48926952)
        self.cliente.historico.return_value = [self.hora('2026-11-27T11:00:00Z')]
        self.monitor = MonitorPublico(self.path, self.cliente, lambda:self.now)
        self.addCleanup(self.monitor.parar_coletor)

    def row(self, ts, **values):
        return {'nodeId':NODE_ID, 'sourceId':SOURCE_ID, 'created':ts, **values}

    def hora(self, ts, wh=1000, start=10000, end=11000):
        return self.row(ts, wh=7, wattHours=wh, wattHours_start=start, wattHours_end=end)

    def avancar(self, segundos=61):
        self.now += timedelta(seconds=segundos)
        self.monitor.coletar()

    def test_inicia_pausado_sem_consultar_api_ou_inventar_valores(self):
        state = self.monitor.estado()
        self.assertEqual(state['estado'], 'pausado')
        self.assertFalse(state['simulado'])
        self.assertEqual(state['total_leituras'], 0)
        self.assertTrue(all(h['energia_kwh'] is None for h in state['serie_horaria']))
        self.cliente.ultima.assert_not_called()

    def test_unidades_origem_e_contador_nao_confundidos_com_energia_diaria(self):
        state = self.monitor.iniciar()
        self.assertEqual(state['ultima_leitura']['potencia_kw'], .114)
        self.assertEqual(state['ultima_leitura']['contador_kwh'], 48926.952)
        self.assertEqual(state['energia_periodo_kwh'], 1)
        self.assertEqual(state['horas_com_dados'], 1)
        self.assertEqual(state['fonte']['source_id'], SOURCE_ID)
        self.assertIsNone(state['fonte']['capacidade_kw'])
        self.assertFalse(state['conexao_hardware_local'])

    def test_repetir_medicao_nao_inventa_nova_leitura(self):
        self.monitor.iniciar()
        self.avancar()
        self.assertEqual(self.monitor.estado()['total_leituras'], 1)
        self.cliente.ultima.return_value = self.row('2026-11-27T12:35:00Z', watts=130, wattHours=48927000)
        self.avancar()
        self.assertEqual(self.monitor.estado()['total_leituras'], 2)

    def test_limite_de_consultas_pausa_e_retomada(self):
        self.monitor.iniciar()
        self.monitor.coletar()
        self.monitor.iniciar()
        self.assertEqual(self.cliente.ultima.call_count, 1)
        self.monitor.pausar()
        self.avancar()
        self.assertEqual(self.cliente.ultima.call_count, 1)
        self.monitor.iniciar()
        self.assertEqual(self.cliente.ultima.call_count, 2)

    def test_leitura_atrasada_e_diferente_de_potencia_zero(self):
        self.cliente.ultima.return_value = self.row('2026-11-27T12:30:00Z', watts=0, wattHours=1)
        self.assertEqual(self.monitor.iniciar()['estado'], 'online')
        self.now += timedelta(minutes=30)
        self.assertEqual(self.monitor.estado()['estado'], 'atrasado')
        self.assertEqual(self.monitor.estado()['ultima_leitura']['potencia_kw'], 0)

    def test_erro_de_rede_preserva_valores_e_indica_falha(self):
        before = self.monitor.iniciar()
        self.cliente.ultima.side_effect = requests.ConnectionError()
        self.avancar()
        after = self.monitor.estado()
        self.assertEqual(after['estado'], 'erro')
        self.assertEqual(after['ultima_leitura'], before['ultima_leitura'])
        self.assertEqual(after['energia_periodo_kwh'], before['energia_periodo_kwh'])
        self.assertIn('nenhum dado será simulado', after['erro'])

    def test_fonte_de_consumo_ou_outro_no_sao_recusados(self):
        for key,value in [('sourceId','consumo'),('nodeId',108)]:
            with self.subTest(key=key):
                self.cliente.ultima.return_value = {**self.row('2026-11-27T12:30:00Z', watts=1), key:value}
                self.monitor.iniciar()
                self.assertEqual(self.monitor.estado()['estado'], 'erro')
                self.assertEqual(self.monitor.estado()['total_leituras'], 0)
                self.now += timedelta(seconds=61)

    def test_valores_invalidos_e_data_futura_nao_entram_no_banco(self):
        invalidos = [self.row('2026-11-27T13:30:00Z', watts=1), self.row('2026-11-27T12:30:00Z', watts=float('nan')),
                     self.row('2026-11-27T12:30:00Z', wattHours=-1), self.row('2026-11-27T12:30:00Z'),
                     self.row('2026-11-27T12:30:00', watts=1)]
        for item in invalidos:
            self.cliente.ultima.return_value = item
            self.monitor.iniciar()
            self.assertEqual(self.monitor.estado()['total_leituras'], 0)
            self.now += timedelta(seconds=61)

    def test_falta_de_potencia_nao_vira_zero(self):
        self.cliente.ultima.return_value = self.row('2026-11-27T12:30:00Z', wattHours=2)
        result = self.monitor.iniciar()
        self.assertIsNone(result['ultima_leitura']['potencia_kw'])
        self.assertEqual(result['ultima_leitura']['contador_kwh'], .002)

    def test_horas_ausentes_diferem_de_zero_e_resets_nao_geram_energia_negativa(self):
        self.cliente.historico.return_value = [self.hora('2026-11-27T09:00:00Z', 0, 0, 0),
                                              self.hora('2026-11-27T10:00:00Z', -50, 100, 50),
                                              self.hora('2026-11-27T11:00:00Z', 100, 1000, 50)]
        result = self.monitor.iniciar()
        self.assertEqual(result['horas_com_dados'], 1)
        horas = result['serie_horaria'][-4:]
        self.assertIsNone(horas[0]['energia_kwh'])
        self.assertEqual(horas[1]['energia_kwh'], 0)
        self.assertEqual(horas[2]['qualidade'], 'contador_inconsistente')
        self.assertIsNone(horas[3]['energia_kwh'])

    def test_historico_invalido_preserva_transacao_anterior(self):
        before = self.monitor.iniciar()
        self.cliente.historico.return_value = [self.hora('2026-11-27T11:00:00Z'), self.hora('2026-11-27T11:00:00Z')]
        self.avancar(601)
        after = self.monitor.estado()
        self.assertEqual(after['energia_periodo_kwh'], before['energia_periodo_kwh'])
        self.assertIsNotNone(after['erro_historico'])
        self.assertIsNone(after['erro'])

    def test_pausa_durante_consulta_nao_salva_resultados_posteriores(self):
        row = self.cliente.ultima.return_value
        self.cliente.ultima.side_effect = lambda: (self.monitor.pausar(), row)[1]
        self.assertEqual(self.monitor.iniciar()['total_leituras'], 0)

    def test_reinicio_preserva_ativacao_e_dados(self):
        original = self.monitor.iniciar()
        segunda = MonitorPublico(self.path, self.cliente, lambda:self.now)
        self.assertTrue(segunda.estado()['ativo'])
        self.assertEqual(segunda.estado()['ultima_leitura'], original['ultima_leitura'])
        self.assertEqual(segunda.estado()['energia_periodo_kwh'], 1)

    def test_historico_tem_cadencia_propria(self):
        self.monitor.iniciar()
        self.avancar()
        self.assertEqual(self.cliente.historico.call_count, 1)
        self.avancar(600)
        self.assertEqual(self.cliente.historico.call_count, 2)


if __name__ == '__main__':
    unittest.main()
