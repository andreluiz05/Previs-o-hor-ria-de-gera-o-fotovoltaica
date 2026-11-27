import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

from central_apis import CentralApisProjeto, extrair_valor_json, testar_endpoint_externo


class CentralApisTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.pasta = Path(self.temp.name)
        self.central = CentralApisProjeto(self.pasta / "apis.sqlite3")

    def test_ja_inicia_com_solarnetwork_cadastrada_e_permite_adicionar_api_propria(self):
        listagem = self.central.listar_tudo(self.pasta)
        self.assertGreaterEqual(len(listagem["apis_nativas"]), 5)
        self.assertEqual(len(listagem["apis_personalizadas"]), 1)
        self.assertIn("SolarNetwork", listagem["apis_personalizadas"][0]["nome"])

        apos_add = self.central.adicionar_personalizada(
            nome="Meu Fronius Local",
            categoria="inversor",
            url="http://192.168.1.50/solar_api/v1/GetInverterRealtimeData.cgi",
            pasta_saida=self.pasta,
            token="segredo1234",
            campo_potencia="Body.Data.PAC.Value",
            unidade="W",
        )
        self.assertEqual(len(apos_add["apis_personalizadas"]), 2)
        novo = next(a for a in apos_add["apis_personalizadas"] if a["nome"] == "Meu Fronius Local")
        self.assertEqual(novo["token_mascarado"], "••••1234")

        # Ativa como inversor principal
        vinculo = self.central.usar_como_inversor_principal(novo["id"], self.pasta)
        self.assertEqual(vinculo["config"]["provedor_inversor"], "Meu Fronius Local")
        self.assertEqual(vinculo["config"]["unidade_potencia_api"], "W")

    def test_extrai_json_solarnetwork_e_fronius_convertendo_watts_para_kw(self):
        payload_sn = {"success": True, "data": {"results": [{"watts": 2450, "wattHoursReading": 99000}]}}
        self.assertEqual(extrair_valor_json(payload_sn, "data.results.0.watts"), 2450.0)

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = payload_sn
        mock_resp.raise_for_status.return_value = None

        with patch("central_apis.requests.get", return_value=mock_resp):
            res = testar_endpoint_externo(
                "https://data.solarnetwork.net/solarquery/api/v1/pub/datum/mostRecent",
                campo_potencia="data.results.0.watts",
                unidade="W",
            )
        self.assertTrue(res["ok"])
        self.assertAlmostEqual(res["potencia_kw"], 2.45, places=3)


if __name__ == "__main__":
    unittest.main()
