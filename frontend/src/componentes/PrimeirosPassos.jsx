import React from 'react';
import { ArrowRight, Sun, PanelsTopLeft, FileSpreadsheet } from 'lucide-react';

export default function PrimeirosPassos({ aoNavegar, aoFechar }) {
  const passos = [
    { id: 'usina', Icone: PanelsTopLeft, titulo: 'Conte sobre sua instalação', texto: 'Informe sua cidade e os equipamentos da proposta ou da etiqueta do inversor.' },
    { id: 'operacional', Icone: Sun, titulo: 'Veja quanto pode gerar', texto: 'Consulte a energia e a economia estimadas para as próximas horas.' },
    { id: 'consulta', Icone: FileSpreadsheet, titulo: 'Digite ou simule valores', texto: 'Sem placas solares? Digite valores fictícios por hora direto no painel ou use o exemplo de 24h.' },
  ];
  return (
    <section className="getting-started" aria-label="Primeiros passos no Helionta">
      <div className="getting-started-heading">
        <div><span className="section-tag">BEM-VINDO AO HELIONTA</span><h2>Sua energia solar, mais fácil de entender.</h2><p>Comece pelos dados da sua instalação. Você pode explorar o exemplo antes de configurar.</p></div>
        <button type="button" className="btn btn-sm" onClick={aoFechar}>Explorar por conta própria</button>
      </div>
      <div className="getting-started-grid">
        {passos.map(({ id, Icone, titulo, texto }, indice) => (
          <button key={id} type="button" className="getting-started-step" onClick={() => aoNavegar(id)}>
            <span className="getting-started-step-top"><Icone size={19} aria-hidden="true" /><span>0{indice + 1}</span></span>
            <strong>{titulo}</strong><p>{texto}</p><span className="getting-started-link">{indice === 0 ? 'Configurar instalação' : indice === 1 ? 'Ver previsão' : 'Importar meus dados'}<ArrowRight size={15} aria-hidden="true" /></span>
          </button>
        ))}
      </div>
      <p className="getting-started-limit">Você pode testar sem possuir placas. Em Monitoramento, inicie o simulador para acompanhar a geração de exemplo automaticamente.</p>
    </section>
  );
}
