import React, { useState, useEffect, useCallback } from 'react';
import * as api from '../../services/api';
import styles from './Eventos.module.css';
import PopupConfira from '../Popup/Popup';
import translateStatus from '../translate/translate';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

function Eventos() {
    const [caravanas, setCaravanas] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [selectedCaravana, setSelectedCaravana] = useState(null);
    const [isPopupOpen, setIsPopupOpen] = useState(false);
    // Estado para guardar a capacidade máxima buscada (pode ser omitido se sempre vier da API)
    // const [maxCapacidadeGeral, setMaxCapacidadeGeral] = useState(0);

    const openPopup = (caravana) => { setSelectedCaravana(caravana); setIsPopupOpen(true); };
    const closePopup = () => { setSelectedCaravana(null); setIsPopupOpen(false); };

    const fetchCaravanas = useCallback(async () => {
        setLoading(true); setError(null);
        try {
            // Assume que api.getCaravanas() agora retorna 'maxCapacidadeDisponivel' em cada caravana
            let caravanasData = await api.getCaravanas();
            console.log("Eventos - Dados brutos:", caravanasData);

            const hoje = new Date(); hoje.setHours(0, 0, 0, 0);

            // --- FILTRO ATUALIZADO ---
            caravanasData = caravanasData.filter(caravana => {
                const dataViagem = new Date(caravana.data + 'T00:00:00');
                const dataFechamento = caravana.dataFechamentoVendas ? new Date(caravana.dataFechamentoVendas + 'T23:59:59') : null;

                // Calcula vagas ocupadas (Admin + Participantes baseados no VagasTotais/Disponiveis atual)
                 const vagasOcupadasParticipantes = (caravana.vagasTotais || 0) - (caravana.vagasDisponiveis ?? (caravana.vagasTotais || 0));
                 const vagasOcupadasTotal = Math.max(0, vagasOcupadasParticipantes) + (caravana.administradorUid ? 1 : 0); // Garante não negativo

                // Determina a capacidade máxima relevante para venda
                const capacidadeMaximaParaVenda = caravana.transporteAlocado // Usa capacidade alocada se já definida
                    ? (caravana.transporteAlocado.assentos || 0)
                    : (caravana.maxCapacidadeDisponivel || 0); // Senão usa a capacidade máxima do maior veículo disponível

                // Condições para EXIBIR
                const isFutura = dataViagem >= hoje;
                const isVendaAberta = !dataFechamento || hoje < dataFechamento;
                // Verifica se AINDA HÁ espaço potencial (ocupadas < capacidade máxima)
                const temVagaPotencial = vagasOcupadasTotal < capacidadeMaximaParaVenda;
                const isStatusValido = caravana.status === "confirmada" || caravana.status === "nao_confirmada";

                return isFutura && isVendaAberta && temVagaPotencial && isStatusValido;
            });
            // --- FIM FILTRO ---

            // Lógica de ordenação e slice
            const confirmadas = caravanasData.filter(c => c.status === 'confirmada');
            const naoConfirmadas = caravanasData.filter(c => c.status === 'nao_confirmada');
            confirmadas.sort((a, b) => new Date(a.data) - new Date(b.data));
            naoConfirmadas.sort((a, b) => new Date(a.data) - new Date(b.data));
            const caravanasExibidas = [...confirmadas.slice(0, 2), ...naoConfirmadas.slice(0, 5)];

            console.log("Eventos - Caravanas filtradas:", caravanasExibidas);
            setCaravanas(caravanasExibidas);

        } catch (err) { setError(err); console.error(err); toast.error("Erro."); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { fetchCaravanas(); }, [fetchCaravanas]);

    const handleCaravanaUpdate = useCallback((updatedCaravanaId) => {
        fetchCaravanas(); // Recarrega após compra
        toast.success("Ingresso(s) comprado(s)!");
        closePopup();
    }, [fetchCaravanas]);

    if (error && caravanas.length === 0) return <div className={styles.error}>Erro.</div>;

    return (
        <>
            <ToastContainer /* ... */ />
            <section className={styles.eventos}>
                <h2>CARAVANAS</h2>
                {loading && <p className={styles.loading}>Carregando...</p>}
                {!loading && caravanas.length === 0 && !error && ( <p className={styles.nenhumaCaravana}>Nenhuma caravana disponível.</p> )}
                {!loading && caravanas.length > 0 && (
                    <div className={styles.gridEventos}>
                        {caravanas.map((caravana) => {
                             // Calcula disponibilidade real para exibição
                             const capacidadeMax = caravana.transporteAlocado ? (caravana.transporteAlocado.assentos || 0) : (caravana.maxCapacidadeDisponivel || 0);
                             const vagasOcup = (caravana.vagasOcupadas || ((caravana.vagasTotais || 0) - (caravana.vagasDisponiveis ?? (caravana.vagasTotais || 0)))) + (caravana.administradorUid ? 1 : 0);
                             const vagasDisp = Math.max(0, capacidadeMax - vagasOcup);
                            return (
                                <div key={caravana.id} className={styles.eventoCard}>
                                    <img src={caravana.imagemCapaLocalidade || caravana.imagensLocalidade?.[0] || "./images/imagem_padrao.jpg"} alt={caravana.nomeLocalidade || 'Caravana'} className={styles.eventoCardImagem}/>
                                    <div className={styles.eventoCardConteudo}>
                                        <h3 className={styles.eventoCardNome}>{caravana.nomeLocalidade || 'Indefinido'}</h3>
                                        <p><strong>Data: </strong>{caravana.data ? new Date(caravana.data + 'T00:00:00').toLocaleDateString() : 'N/A'}</p>
                                        <p><strong>Status:</strong> {translateStatus(caravana.status)}</p>
                                        <p><strong>Vagas Disp.:</strong> {vagasDisp === 0 ? 'Esgotado' : vagasDisp}</p>
                                        <button onClick={() => openPopup(caravana)} className={styles.eventoCardBotao}> Ver Detalhes </button>
                                    </div>
                                </div>
                            );
                         })}
                    </div>
                 )}
            </section>
            {isPopupOpen && ( <PopupConfira caravana={selectedCaravana} onClose={closePopup} onCompraSucesso={handleCaravanaUpdate}/> )}
        </>
    );
}

export default Eventos;