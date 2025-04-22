// src/components/Eventos/Eventos.js
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

    const openPopup = (caravana) => {
        setSelectedCaravana(caravana);
        setIsPopupOpen(true);
    };

    const closePopup = () => {
        setSelectedCaravana(null);
        setIsPopupOpen(false);
    };

    const fetchCaravanas = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            let caravanasData = await api.getCaravanas(); 
            console.log("Dados brutos de /caravanas:", caravanasData); 

            caravanasData = caravanasData.filter(caravana =>
                caravana.vagasDisponiveis > 0 &&
                (caravana.status === "confirmada" || caravana.status === "nao_confirmada") &&
                new Date(caravana.data) > new Date() 
            );
            const confirmadas = caravanasData.filter(c => c.status === 'confirmada');
            const naoConfirmadas = caravanasData.filter(c => c.status === 'nao_confirmada');
            confirmadas.sort((a, b) => new Date(a.data) - new Date(b.data));
            naoConfirmadas.sort((a, b) => new Date(a.data) - new Date(b.data));
            const caravanasExibidas = [
                ...confirmadas.slice(0, 2),
                ...naoConfirmadas.slice(0, 5)
            ];

            console.log("Caravanas filtradas para Eventos:", caravanasExibidas); 
            setCaravanas(caravanasExibidas);

        } catch (err) {
            setError(err);
            console.error("Erro ao buscar caravanas para Eventos:", err);
            toast.error("Erro ao carregar eventos."); 
        } finally {
            setLoading(false);
        }
    }, []); 
    useEffect(() => {
        fetchCaravanas();
    }, [fetchCaravanas]);
    const handleCaravanaUpdate = useCallback((caravanaAtualizada) => {
        setCaravanas(prevCaravanas =>
            prevCaravanas.map(c =>
                c.id === caravanaAtualizada.id ? caravanaAtualizada : c
            )
        );
        toast.success("Ingresso(s) comprado(s) com sucesso!");
    }, []);

    if (error && caravanas.length === 0) return <div className={styles.error}>Erro ao carregar eventos. Tente novamente.</div>;


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
                {caravanas.length === 0 && !loading && !error ? (
                    <p className={styles.nenhumaCaravana}>Nenhuma caravana disponível no momento.</p>
                 ) : (
                    <div className={styles.gridEventos}>
                        {caravanas.map((caravana) => (
                            <div key={caravana.id} className={styles.eventoCard}>
                                <img
                                    src={caravana.imagemCapaLocalidade || caravana.imagensLocalidade?.[0] || "./images/imagem_padrao.jpg"}
                                    alt={caravana.nomeLocalidade || 'Caravana'} 
                                    className={styles.eventoCardImagem}
                                />
                                <div className={styles.eventoCardConteudo}>
                                    <h3 className={styles.eventoCardNome}>{caravana.nomeLocalidade || 'Destino Indefinido'}</h3>
                                    <p><strong>Data: </strong>{caravana.data ? new Date(caravana.data).toLocaleDateString() : 'N/A'}</p>
                                    <p><strong>Status:</strong> {translateStatus(caravana.status)}</p>
                                    <p><strong>Vagas:</strong> {caravana.vagasDisponiveis === 0 ? 'Esgotado' : caravana.vagasDisponiveis}</p>
                                    <button onClick={() => openPopup(caravana)} className={styles.eventoCardBotao}>
                                        Ver Detalhes
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                 )}
            </section>
            {isPopupOpen && (
                <PopupConfira
                    caravana={selectedCaravana}
                    onClose={closePopup}
                    onCompraSucesso={handleCaravanaUpdate}
                />
            )}
        </>
    );
}

export default Eventos;