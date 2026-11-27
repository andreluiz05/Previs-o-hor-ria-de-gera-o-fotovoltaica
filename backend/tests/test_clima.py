import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

import pandas as pd
import requests

from clima import obter_clima


class ClimaTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.cache = Path(self.temp.name) / 'clima.json'
        self.cfg = {'latitude': -7.8342, 'longitude': -34.9064}
        self.colunas = ['temperature_2m', 'shortwave_radiation']
        self.indice = pd.date_range(pd.Timestamp.now(tz='America/Recife').tz_localize(None).floor('h'), periods=48, freq='h')
        self.registros = [{'time': ts.isoformat(), 'temperature_2m': 29, 'shortwave_radiation': 100} for ts in self.indice]
        self.estimar = Mock(return_value=pd.DataFrame(0., index=self.indice, columns=self.colunas))

    def consulta(self, offline=False):
        return obter_clima(self.indice, self.cfg, self.colunas, self.cache, self.estimar, offline)

    def salvar_cache(self, **changes):
        dados = {**self.cfg, 'capturado_em': pd.Timestamp.now(tz='America/Recife').isoformat(), 'registros': self.registros, **changes}
        self.cache.write_text(json.dumps(dados), encoding='utf-8')

    @patch('clima.requests.get')
    def test_api_valida_salva_e_informa_consulta(self, get):
        get.return_value = Mock(json=lambda: {'hourly': pd.DataFrame(self.registros).to_dict('list')})
        df, meta = self.consulta()
        self.assertEqual(len(df), 48)
        self.assertEqual(meta['status'], 'online')
        self.assertTrue(meta['api_disponivel'])
        self.assertFalse(meta['dados_simulados'])
        self.assertIsNotNone(meta['atualizado_em'])
        self.assertTrue(self.cache.exists())
        self.estimar.assert_not_called()

    @patch('clima.requests.get', side_effect=requests.ConnectionError())
    def test_falha_utiliza_cache_recente_do_mesmo_local(self, get):
        self.salvar_cache()
        _, meta = self.consulta()
        self.assertEqual(meta['status'], 'cache')
        self.assertFalse(meta['api_disponivel'])
        self.assertFalse(meta['dados_simulados'])
        self.estimar.assert_not_called()

    @patch('clima.requests.get', side_effect=requests.ConnectionError())
    def test_cache_vencido_outro_local_corrompido_lacunas_futuro(self, get):
        casos = [
            {'capturado_em': (pd.Timestamp.now(tz='America/Recife') - pd.Timedelta(hours=7)).isoformat()},
            {'latitude': -23.55}, {'longitude': -46.63},
            {'registros': self.registros[:-1]}, {'capturado_em': 'ontem'},
            {'capturado_em': (pd.Timestamp.now(tz='America/Recife') + pd.Timedelta(hours=2)).isoformat()},
        ]
        for caso in casos:
            with self.subTest(caso=list(caso)):
                self.salvar_cache(**caso)
                df, meta = self.consulta()
                self.assertEqual(meta['status'], 'demonstracao')
                self.assertTrue(meta['dados_simulados'])
                self.assertIsNone(meta['atualizado_em'])
                self.assertTrue(df.index.equals(self.indice))
        self.cache.write_text('{broken', encoding='utf-8')
        self.assertEqual(self.consulta()[1]['status'], 'demonstracao')

    @patch('clima.requests.get')
    def test_demonstracao_nao_consulta_api_nem_recicla_cache(self, get):
        self.salvar_cache()
        _, meta = self.consulta(offline=True)
        get.assert_not_called()
        self.estimar.assert_called_once()
        self.assertEqual(meta['status'], 'demonstracao')
        self.assertIsNone(meta['api_disponivel'])

    @patch('clima.requests.get')
    def test_api_com_lacunas_nao_rotula_clima_como_atualizado(self, get):
        get.return_value = Mock(json=lambda: {'hourly': pd.DataFrame(self.registros[:-1]).to_dict('list')})
        _, meta = self.consulta()
        self.assertEqual(meta['status'], 'demonstracao')
        self.assertFalse(meta['api_disponivel'])
        self.assertFalse(self.cache.exists())


if __name__ == '__main__':
    unittest.main()
