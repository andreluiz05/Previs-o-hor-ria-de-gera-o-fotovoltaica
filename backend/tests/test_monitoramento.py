import math
import tempfile
import unittest
from datetime import datetime, timedelta
from pathlib import Path

from monitoramento import INTERVALO_COLETA, TZ, InversorSimulado, MonitoramentoSolar

CONFIG = {'nome': 'Simulação de teste', 'cidade': 'Igarassu, Pernambuco', 'latitude': -7.8342,
          'longitude': -34.9064, 'quantidade_placas': 10, 'potencia_placa_wp': 550,
          'inversor_kw': 5, 'inclinacao_graus': 10, 'azimute_graus': 0,
          'eficiencia_inversor': .96, 'perdas_dc': .08}


class Relogio:
    def __init__(self):
        self.agora = datetime(2026, 11, 27, 10, tzinfo=TZ)
    def __call__(self):
        return self.agora


class FonteConstante:
    def potencia_kw(self, instante, config, cenario):
        return 2.0


class MonitoramentoTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='helionta-monitor-teste-')
        self.path = Path(self.tmp.name) / 'leituras.sqlite3'
        self.relogio = Relogio()
        self.monitor = MonitoramentoSolar(self.path, FonteConstante(), self.relogio)
    def tearDown(self):
        self.monitor.parar_coletor()
        self.tmp.cleanup()
    def test_primeira_leitura_nao_inventa_energia_nem_horas_anteriores(self):
        status = self.monitor.iniciar(CONFIG)
        self.assertEqual(status['total_leituras'], 1)
        self.assertEqual(status['energia_total_kwh'], 0)
        self.assertIsNone(status['serie_horaria'][0]['energia_kwh'])
        self.assertEqual(len(status['serie_horaria']), 1)
        self.assertTrue(status['simulado'])
        self.assertFalse(status['conexao_hardware'])
    def test_integracao_de_potencia_e_hora_completa(self):
        self.monitor.iniciar(CONFIG)
        for _ in range(4): self.monitor.coletar()
        status = self.monitor.estado()
        self.assertAlmostEqual(status['energia_total_kwh'], 2)
        self.assertEqual(status['serie_horaria'][0]['situacao'], 'completa')
        self.assertEqual(status['serie_horaria'][0]['cobertura_minutos'], 60)
        self.assertAlmostEqual(status['serie_horaria'][0]['energia_kwh'], 2)
        self.assertIsNone(status['serie_horaria'][1]['energia_kwh'])
    def test_pausa_e_retomada_acelerada_nao_preenchem_tempo_parado(self):
        self.monitor.iniciar(CONFIG)
        self.monitor.coletar()
        antes = self.monitor.pausar()
        self.relogio.agora += timedelta(hours=4)
        self.monitor.coletar()
        self.assertEqual(self.monitor.estado()['total_leituras'], antes['total_leituras'])
        self.monitor.iniciar(CONFIG)
        self.monitor.coletar()
        self.assertAlmostEqual(self.monitor.estado()['energia_total_kwh'], 1)
    def test_historico_e_estado_persistem_em_outro_coletor(self):
        self.monitor.iniciar(CONFIG)
        self.monitor.coletar()
        antes = self.monitor.estado()
        segundo = MonitoramentoSolar(self.path, FonteConstante(), self.relogio)
        self.assertEqual(segundo.estado()['sessao']['id'], antes['sessao']['id'])
        self.assertEqual(segundo.estado()['total_leituras'], 2)
        self.assertTrue(segundo.estado()['ativo'])
        segundo.coletar()
        self.assertEqual(segundo.estado()['total_leituras'], 3)
    def test_nova_sessao_preserva_anteriores(self):
        antiga = self.monitor.iniciar(CONFIG)
        self.monitor.coletar()
        nova = self.monitor.iniciar(CONFIG, cenario='nublado', nova_sessao=True)
        self.assertNotEqual(antiga['sessao']['id'], nova['sessao']['id'])
        self.assertEqual(self.monitor.estado(antiga['sessao']['id'])['total_leituras'], 2)
        self.assertFalse(self.monitor.estado(antiga['sessao']['id'])['ativo'])
    def test_mudanca_de_equipamentos_inicia_sessao_sem_misturar_dados(self):
        antiga = self.monitor.iniciar(CONFIG)
        nova = self.monitor.iniciar({**CONFIG, 'inversor_kw': 3})
        self.assertNotEqual(antiga['sessao']['id'], nova['sessao']['id'])
        self.assertEqual(nova['sessao']['config']['inversor_kw'], 3)
        self.assertEqual(self.monitor.estado(antiga['sessao']['id'])['sessao']['config']['inversor_kw'], 5)
    def test_lacuna_de_coleta_real_nao_vira_zero_nem_energia_inventada(self):
        self.monitor.iniciar(CONFIG, modo='tempo_real')
        self.relogio.agora += timedelta(seconds=2)
        self.monitor.coletar()
        antes = self.monitor.pausar()
        self.relogio.agora += timedelta(hours=2)
        depois = self.monitor.iniciar(CONFIG, modo='tempo_real')
        self.assertAlmostEqual(depois['energia_total_kwh'], antes['energia_total_kwh'])
        self.assertFalse(depois['ultima_leitura']['intervalo_valido'])
        self.assertTrue(any(row['situacao'] == 'sem_leitura' for row in depois['serie_horaria']))
    def test_intervalo_que_atravessa_hora_e_repartido(self):
        self.relogio.agora = datetime(2026, 11, 27, 10, 59, 59, tzinfo=TZ)
        self.monitor.iniciar(CONFIG, modo='tempo_real')
        self.relogio.agora += timedelta(seconds=2)
        self.monitor.coletar()
        dados = self.monitor.estado()
        self.assertEqual(len(dados['serie_horaria']), 2)
        for hora in dados['serie_horaria']:
            self.assertAlmostEqual(hora['energia_kwh'], 2/3600, places=6)
    def test_energia_do_dia_na_virada_da_meia_noite(self):
        self.relogio.agora = datetime(2026, 11, 27, 23, 59, 59, tzinfo=TZ)
        self.monitor.iniciar(CONFIG, modo='tempo_real')
        self.relogio.agora += timedelta(seconds=2)
        self.monitor.coletar()
        dados = self.monitor.estado()
        self.assertAlmostEqual(dados['energia_dia_kwh'], 2/3600, places=6)
        self.assertAlmostEqual(dados['energia_total_kwh'], 4/3600, places=6)
    def test_atraso_difere_de_zero_noturno(self):
        self.monitor.iniciar(CONFIG)
        self.relogio.agora += timedelta(seconds=11)
        self.assertEqual(self.monitor.estado()['estado'], 'atrasado')
        self.monitor.pausar()
        self.assertEqual(self.monitor.estado()['estado'], 'pausado')
    def test_geometria_solar_zero_noturno_e_limite_do_inversor(self):
        fonte = InversorSimulado()
        self.assertEqual(fonte.potencia_kw(datetime(2026, 11, 27, 0, tzinfo=TZ), CONFIG, 'sol'), 0)
        power = fonte.potencia_kw(datetime(2026, 11, 27, 12, tzinfo=TZ), {**CONFIG, 'inversor_kw': .3}, 'sol')
        self.assertGreater(power, 0)
        self.assertLessEqual(power, .3)
    def test_cenarios_influenciam_geracao(self):
        fonte = InversorSimulado()
        instante = datetime(2026, 11, 27, 12, tzinfo=TZ)
        self.assertGreater(fonte.potencia_kw(instante, CONFIG, 'sol'), fonte.potencia_kw(instante, CONFIG, 'nublado'))
        self.assertGreater(fonte.potencia_kw(instante, CONFIG, 'nublado'), fonte.potencia_kw(instante, CONFIG, 'chuva'))
    def test_opcoes_e_sessao_inexistente_rejeitadas(self):
        with self.assertRaises(ValueError): self.monitor.iniciar(CONFIG, modo='invalido')
        with self.assertRaises(ValueError): self.monitor.estado('inexistente')
    def test_coletor_nao_inicia_duas_threads(self):
        self.monitor.iniciar_coletor()
        thread = self.monitor.thread
        self.monitor.iniciar_coletor()
        self.assertIs(self.monitor.thread, thread)
        self.monitor.parar_coletor()
        self.assertFalse(thread.is_alive())


if __name__ == '__main__':
    unittest.main()
