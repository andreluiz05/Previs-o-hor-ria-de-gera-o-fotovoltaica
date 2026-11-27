import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from solar_engine import buscar_localidades, importar_planilha_inversor_usuario


class ImportacaoTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.pasta = Path(self.temp.name)

    def importar(self, valores):
        csv = 'data_hora;energia_kwh\n' + '\n'.join(
            f'2026-11-26 {i + 8:02d}:00:00;{valor}' for i, valor in enumerate(valores)
        )
        return importar_planilha_inversor_usuario(csv.encode(), self.pasta, dados_exemplo=True)

    @patch('solar_engine._estimar_serie_hibrida_com_escala', side_effect=lambda df, fisica, cfg, pasta: fisica['referencia_kwh'])
    @patch('solar_engine._buscar_clima_historico_open_meteo')
    def test_virgula_decimal_e_exemplo_nao_vira_medicao_real(self, buscar, estimar):
        from solar_engine import _clima_ilustrativo
        buscar.side_effect = lambda idx, cfg: (_clima_ilustrativo(idx, cfg), 'Clima ilustrativo')
        result = self.importar(['0,00', '1,50', '2,25', '0,00', '0,00', '0,00'])
        self.assertEqual(result['energia_real_total_kwh'], 3.75)
        self.assertTrue(result['dados_exemplo'])
        self.assertFalse(result['pronto_para_retreino_completo'])
        self.assertIn('exemplo', result['diagnostico']['titulo'])
        self.assertEqual(result['diagnostico']['nivel'], 'alerta')
        self.assertFalse((self.pasta / 'csv_usuario_carregado.csv').exists())

    @patch('requests.get', side_effect=OSError('sem rede'))
    def test_igarassu_disponivel_no_catalogo_offline(self, _mock_get):
        cidades = buscar_localidades('Igarassu')
        self.assertTrue(any(c['nome'] == 'Igarassu' for c in cidades))

    def test_dados_invalidos_sao_recusados_antes_de_consultar_rede(self):
        with patch('solar_engine._buscar_clima_historico_open_meteo') as buscar:
            for invalid in ['inf', '-1', 'abc', '']:
                with self.subTest(invalid=invalid):
                    with self.assertRaisesRegex(ValueError, 'finitos'):
                        self.importar([invalid] + ['0'] * 5)
            buscar.assert_not_called()


if __name__ == '__main__':
    unittest.main()
