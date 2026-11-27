import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

from solar_engine import _clima_ilustrativo
from tempo_real import CentralTempoReal

TZ = timezone(timedelta(hours=-3))


class TempoRealTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.pasta = Path(self.temp.name)
        self.central = CentralTempoReal(self.pasta / "tempo_real.sqlite3")

    @patch("tempo_real.CentralTempoReal._obter_clima_hoje")
    def test_calcula_potencia_tempo_real_ao_meio_dia_e_zero_a_noite(self, mock_clima):
        mock_clima.side_effect = lambda idx, cfg, pasta: (
            _clima_ilustrativo(idx, cfg),
            {"status": "online", "fonte": "Open-Meteo"},
        )
        meio_dia = datetime(2026, 11, 27, 12, 0, 0, tzinfo=TZ)
        estado_dia = self.central.estado_agora(self.pasta, agora_override=meio_dia)
        self.assertTrue(estado_dia["sol_acima_horizonte"])
        self.assertGreater(estado_dia["potencia_atual_kw"], 1.0)
        self.assertEqual(estado_dia["modo_operacao"], "clima_tempo_real")

        noite = datetime(2026, 11, 27, 22, 0, 0, tzinfo=TZ)
        estado_noite = self.central.estado_agora(self.pasta, agora_override=noite)
        self.assertFalse(estado_noite["sol_acima_horizonte"])
        self.assertEqual(estado_noite["potencia_atual_kw"], 0.0)

    @patch("tempo_real.CentralTempoReal._obter_clima_hoje")
    def test_leitura_real_inversor_ativa_modo_conectado_e_detecta_queda_eletrica(self, mock_clima):
        mock_clima.side_effect = lambda idx, cfg, pasta: (
            _clima_ilustrativo(idx, cfg),
            {"status": "online", "fonte": "Open-Meteo"},
        )
        meio_dia = datetime(2026, 11, 27, 12, 0, 0, tzinfo=TZ)

        # Inversor envia 0 kW em pleno meio-dia de sol -> alerta imediato
        queda = self.central.registrar_leitura_real(0.0, self.pasta, origem="Inversor Fronius", agora_override=meio_dia)
        self.assertTrue(queda["inversor_conectado_ao_vivo"])
        self.assertEqual(queda["potencia_atual_kw"], 0.0)
        self.assertEqual(queda["diagnostico_agora"]["nivel"], "alerta")

        # Inversor envia potência normal -> saudável
        esperado = queda["potencia_esperada_agora_kw"]
        ok = self.central.registrar_leitura_real(esperado, self.pasta, origem="Inversor Fronius", agora_override=meio_dia)
        self.assertEqual(ok["diagnostico_agora"]["nivel"], "otimo")


if __name__ == "__main__":
    unittest.main()
