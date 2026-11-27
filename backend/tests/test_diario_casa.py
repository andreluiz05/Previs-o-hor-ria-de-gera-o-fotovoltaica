import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from diario_casa import DiarioSolarCasa
from solar_engine import _clima_ilustrativo


class DiarioCasaTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.pasta = Path(self.temp.name)
        self.banco = self.pasta / "diario_casa.sqlite3"

    @patch("diario_casa._buscar_clima_historico_open_meteo")
    def test_salvar_dia_total_persiste_ao_reabrir_e_permite_excluir(self, mock_clima):
        mock_clima.side_effect = lambda idx, cfg: (_clima_ilustrativo(idx, cfg), "Clima local")
        diario = DiarioSolarCasa(self.banco)

        vazio = diario.consultar(self.pasta)
        self.assertFalse(vazio["possui_registros"])

        salvo = diario.registrar_dia_total("2026-11-25", 24.5, self.pasta)
        self.assertTrue(salvo["possui_registros"])
        self.assertEqual(salvo["total_dias"], 1)
        self.assertAlmostEqual(salvo["kpis"]["energia_real_total_kwh"], 24.5, places=1)
        # Noite deve permanecer zero
        meia_noite = next(r for r in salvo["registros_horarios"] if r["hora"] == "00:00")
        self.assertEqual(meia_noite["geracao_real_kwh"], 0.0)

        # Simula recarregar / reiniciar o servidor abrindo nova instância no mesmo SQLite
        reaberto = DiarioSolarCasa(self.banco).consultar(self.pasta)
        self.assertTrue(reaberto["possui_registros"])
        self.assertEqual(reaberto["total_dias"], 1)
        self.assertAlmostEqual(reaberto["kpis"]["energia_real_total_kwh"], 24.5, places=1)

        # Adiciona um segundo dia hora a hora
        diario.registrar_horas_dia("2026-11-26", {"10": 2.5, "11": 3.5, "12": 4.0}, self.pasta)
        dois_dias = diario.consultar(self.pasta)
        self.assertEqual(dois_dias["total_dias"], 2)
        self.assertAlmostEqual(dois_dias["kpis"]["energia_real_total_kwh"], 34.5, places=1)

        # Remove o primeiro dia
        apos_remover = diario.remover_dia("2026-11-25", self.pasta)
        self.assertEqual(apos_remover["total_dias"], 1)
        self.assertAlmostEqual(apos_remover["kpis"]["energia_real_total_kwh"], 10.0, places=1)

    @patch("diario_casa._buscar_clima_historico_open_meteo")
    def test_diagnostico_diferencia_sujeira_sombra_e_falha_eletrica(self, mock_clima):
        mock_clima.side_effect = lambda idx, cfg: (_clima_ilustrativo(idx, cfg), "Clima local")
        diario = DiarioSolarCasa(self.banco)

        # Primeiro descobre o esperado do dia lançando um valor normal
        base = diario.registrar_dia_total("2026-11-20", 30.0, self.pasta)
        esperado_dia = base["kpis"]["energia_prevista_total_kwh"]

        # 1) Sujeira uniforme (-20% do esperado)
        sujo = diario.registrar_dia_total("2026-11-20", esperado_dia * 0.80, self.pasta)
        self.assertEqual(sujo["diagnostico"]["causa"], "sujeira_nos_modulos")
        self.assertTrue(len(sujo["diagnostico"]["verificacoes"]) >= 2)

        # 2) Falha elétrica / disjuntor (queda de -55%)
        eletrica = diario.registrar_dia_total("2026-11-20", esperado_dia * 0.45, self.pasta)
        self.assertEqual(eletrica["diagnostico"]["causa"], "eletrica_ou_inversor")
        self.assertEqual(eletrica["diagnostico"]["nivel"], "alerta")

        # 3) Sombreamento à tarde (manhã/meio-dia normais, 14h e 15h com queda forte, mas > 0)
        normal = diario.registrar_dia_total("2026-11-20", esperado_dia, self.pasta)
        mapa_horas = {str(int(r["hora"][:2])): r["previsao_kwh"] for r in normal["registros_horarios"]}
        mapa_horas["14"] = round(mapa_horas["14"] * 0.35, 3)
        mapa_horas["15"] = round(mapa_horas["15"] * 0.35, 3)
        sombra = diario.registrar_horas_dia("2026-11-20", mapa_horas, self.pasta)
        self.assertEqual(sombra["diagnostico"]["causa"], "sombreamento_parcial")
        self.assertTrue(len(sombra["diagnostico"]["horarios_afetados"]) >= 2)


if __name__ == "__main__":
    unittest.main()
