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

    def test_atualizar_local_clima_suporta_estacao_real_e_accuweather_oficial(self):
        mock_wttr = MagicMock()
        mock_wttr.status_code = 200
        mock_wttr.ok = True
        mock_wttr.raise_for_status.return_value = None
        mock_wttr.json.return_value = {
            "current_condition": [
                {
                    "temp_C": "30",
                    "FeelsLikeC": "32",
                    "cloudcover": "35",
                    "windspeedKmph": "14",
                    "humidity": "62",
                }
            ]
        }
        mock_om = MagicMock()
        mock_om.status_code = 200
        mock_om.ok = True
        mock_om.raise_for_status.return_value = None
        mock_om.json.return_value = {"current": {"shortwave_radiation": 520.0, "temperature_2m": 27.5}}

        with patch("clima.requests.get", side_effect=[mock_wttr, mock_om]):
            resp = self.central.atualizar_local_clima(
                cidade="Igarassu, Pernambuco",
                latitude=-7.8342,
                longitude=-34.9064,
                pasta_saida=self.pasta,
                provedor_clima="accuweather",
            )

        self.assertEqual(resp["config"]["cidade"], "Igarassu, Pernambuco")
        self.assertTrue(resp["clima_atual"]["ok"])
        # Deve refletir os 30 °C da estação terrestre real em vez dos 27,5 °C da célula marítima
        self.assertEqual(resp["clima_atual"]["temperatura_c"], 30.0)
        self.assertEqual(resp["clima_atual"]["sensacao_c"], 32.0)

        # Testa também fluxo oficial com chave da AccuWeather
        mock_geo = MagicMock(ok=True, status_code=200)
        mock_geo.raise_for_status.return_value = None
        mock_geo.json.return_value = {"Key": "45882", "LocalizedName": "Igarassu"}

        mock_aw_cur = MagicMock(ok=True, status_code=200)
        mock_aw_cur.raise_for_status.return_value = None
        mock_aw_cur.json.return_value = [
            {
                "WeatherText": "Ensolarado",
                "Temperature": {"Metric": {"Value": 30.2}},
                "RealFeelTemperature": {"Metric": {"Value": 32.5}},
                "SolarIrradiance": {"Value": 615.0},
                "CloudCover": 30,
                "RelativeHumidity": 60,
                "Wind": {"Speed": {"Metric": {"Value": 15.0}}},
            }
        ]
        with patch("clima.requests.get", side_effect=[mock_geo, mock_aw_cur]):
            resp_aw = self.central.atualizar_local_clima(
                cidade="Igarassu, Pernambuco",
                latitude=-7.8342,
                longitude=-34.9064,
                pasta_saida=self.pasta,
                provedor_clima="accuweather",
                chave_api_accuweather="minha_chave_accu_teste",
            )
        self.assertEqual(resp_aw["clima_atual"]["modo_fonte"], "accuweather_oficial")
        self.assertEqual(resp_aw["clima_atual"]["temperatura_c"], 30.2)
        self.assertEqual(resp_aw["clima_atual"]["irradiancia_wm2"], 615.0)


if __name__ == "__main__":
    unittest.main()
