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

    const openPopup = (caravana) => { setSelectedCaravana(caravana); setIsPopupOpen(true); };
    const closePopup = () => { setSelectedCaravana(null); setIsPopupOpen(false); };

    const calcularDisponibilidade = (caravana) => {
        if (!caravana) return { vagasCliente: 0, capacidadeTotalExibida: 0 };

        let capacidadeBase = 0;
        let numAdminsConsiderados = 0;
        const vagasOcup = caravana.vagasOcupadas || 0;
        const transporteDefinido = caravana.transporteDefinidoManualmente || caravana.transporteAutoDefinido;

        if (transporteDefinido) {
            capacidadeBase = caravana.capacidadeFinalizada || 0;
            if (capacidadeBase > 0 && Array.isArray(caravana.transportesFinalizados)) {
                numAdminsConsiderados = Math.min(capacidadeBase, caravana.transportesFinalizados.length);
            }
        } else {
            capacidadeBase = caravana.capacidadeMaximaTeorica || 0;
            if (capacidadeBase > 0) {
                numAdminsConsiderados = Math.min(capacidadeBase, caravana.maximoTransportes || 0);
            }
        }

        const vagasDispCliente = Math.max(0, capacidadeBase - vagasOcup - numAdminsConsiderados);

        return {
            vagasCliente: vagasDispCliente,
            capacidadeTotalExibida: capacidadeBase
        };
    };

    const fetchCaravanas = useCallback(async () => {
        setLoading(true); setError(null);
        try {
            let caravanasData = await api.getCaravanas();
            const hoje = new Date(); hoje.setHours(0, 0, 0, 0);

            caravanasData = caravanasData.filter(caravana => {
                const dataViagem = new Date(caravana.data + 'T00:00:00Z');
                const dataFechamento = caravana.dataFechamentoVendas ? new Date(caravana.dataFechamentoVendas + 'T23:59:59Z') : null;

                const disponibilidade = calcularDisponibilidade(caravana);

                const isFutura = dataViagem >= hoje;
                const isVendaAberta = !dataFechamento || hoje < dataFechamento;
                const temVagaCliente = disponibilidade.capacidadeTotalExibida > 0 && disponibilidade.vagasCliente > 0;
                const isStatusValido = caravana.status === "confirmada" || caravana.status === "nao_confirmada";

                return isFutura && isVendaAberta && temVagaCliente && isStatusValido;
            });

            const confirmadas = caravanasData.filter(c => c.status === 'confirmada');
            const naoConfirmadas = caravanasData.filter(c => c.status === 'nao_confirmada');
            confirmadas.sort((a, b) => new Date(a.data) - new Date(b.data));
            naoConfirmadas.sort((a, b) => new Date(a.data) - new Date(b.data));

            const maxConfirmadas = 2;
            const maxNaoConfirmadas = 5;
            const caravanasExibidas = [
                ...confirmadas.slice(0, maxConfirmadas),
                ...naoConfirmadas.slice(0, maxNaoConfirmadas)
            ];

            setCaravanas(caravanasExibidas);

        } catch (err) {
            setError(err);
            console.error(err);
            toast.error("Erro ao buscar caravanas.");
        }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { fetchCaravanas(); }, [fetchCaravanas]);

    const handleCaravanaUpdate = useCallback(() => {
        fetchCaravanas();
        toast.success("Ingresso(s) comprado(s)!");
        closePopup();
    }, [fetchCaravanas]);

    if (error && caravanas.length === 0) return <div className={styles.error}>Erro ao carregar caravanas.</div>;

    return (
        <>
            <ToastContainer
                position="top-right"
                autoClose={3000}
                hideProgressBar={false}
                newestOnTop={false}
                closeOnClick
                rtl={false}
                pauseOnFocusLoss
                draggable
                pauseOnHover
                theme="light"
            />
            <section className={styles.eventos}>
                <h2>CARAVANAS</h2>
                {loading && <p className={styles.loading}>Carregando...</p>}
                {!loading && caravanas.length === 0 && !error && ( <p className={styles.nenhumaCaravana}>Nenhuma caravana disponível no momento.</p> )}
                {!loading && caravanas.length > 0 && (
                    <div className={styles.gridEventos}>
                        {caravanas.map((caravana) => {
                             const disponibilidade = calcularDisponibilidade(caravana);
                            return (
                                <div key={caravana.id} className={styles.eventoCard}>
                                    <img src={caravana.imagemCapaLocalidade || caravana.imagensLocalidade?.[0] || "./images/imagem_padrao.jpg"} alt={caravana.nomeLocalidade || 'Caravana'} className={styles.eventoCardImagem}/>
                                    <div className={styles.eventoCardConteudo}>
                                        <h3 className={styles.eventoCardNome}>{caravana.nomeLocalidade || 'Destino Indefinido'}</h3>
                                        <p><strong>Data: </strong>{caravana.data ? new Date(caravana.data + 'T00:00:00Z').toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : 'N/A'}</p>
                                        <p><strong>Status:</strong> {translateStatus(caravana.status)}</p>
                                        <p><strong>Capacidade maxima:</strong> {disponibilidade.capacidadeTotalExibida > 0 ? disponibilidade.capacidadeTotalExibida : 'A definir'}</p>
                                        <p><strong>Vagas Disponiveis:</strong> {disponibilidade.capacidadeTotalExibida === 0 ? 'A definir' : (disponibilidade.vagasCliente === 0 ? 'Esgotado' : disponibilidade.vagasCliente)}</p>
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