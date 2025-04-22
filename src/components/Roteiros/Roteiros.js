// src/pages/Roteiros.js
import React, { useState, useEffect, useCallback } from 'react';
import * as api from '../../services/api';
import PopupConfira from '../Popup/Popup';
import styles from './Roteiros.module.css';
import { ToastContainer, toast } from 'react-toastify'; 
import 'react-toastify/dist/ReactToastify.css';      

function Roteiros() {
    const [caravanas, setCaravanas] = useState([]);
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null);
    const [popupCaravana, setPopupCaravana] = useState(null);
    const [isPopupOpen, setIsPopupOpen] = useState(false);

    const openPopup = (caravana) => {
        setPopupCaravana(caravana);
        setIsPopupOpen(true);
    };

    const closePopup = () => {
        setPopupCaravana(null);
        setIsPopupOpen(false);
    };

    const buscarCaravanas = useCallback(async () => { 
        setLoading(true);
        setError(null);
        try {
            let caravanasData = await api.getCaravanas(); 
            caravanasData = caravanasData.filter(caravana =>
                caravana.vagasDisponiveis > 0 &&
                new Date(caravana.data) > new Date() &&
                (caravana.status === 'confirmada' || caravana.status === 'nao_confirmada')
            );
            const confirmadas = caravanasData.filter(c => c.status === 'confirmada');
            const naoConfirmadas = caravanasData.filter(c => c.status === 'nao_confirmada');
            confirmadas.sort((a, b) => new Date(a.data) - new Date(b.data));
            naoConfirmadas.sort((a, b) => new Date(a.data) - new Date(b.data));
            setCaravanas([...confirmadas, ...naoConfirmadas]);
            // ----------------------------------------

        } catch (error) {
            setError(error);
            console.error("Erro ao buscar caravanas:", error);
            toast.error("Erro ao carregar roteiros."); 
        } finally {
            setLoading(false);
        }
    }, []); 

    useEffect(() => {
        buscarCaravanas();
    }, [buscarCaravanas]);
    const handleCaravanaUpdate = useCallback((caravanaAtualizada) => {
        setCaravanas(prevCaravanas =>
            prevCaravanas.map(c =>
                c.id === caravanaAtualizada.id ? caravanaAtualizada : c
            )
        );
        toast.success("Ingresso(s) comprado(s) com sucesso!");
    }, []); 

    if (error && caravanas.length === 0) return <div className={styles.error}>Erro ao carregar roteiros. Tente novamente.</div>;

    return (
        <div className={styles.container}>
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
            <h1>Roteiros</h1>
            {caravanas.length === 0 && !loading && !error ? (
                 <p className={styles.nenhumaCaravana}>Nenhuma caravana encontrada para os próximos roteiros.</p>
             ) : (
                <div className={styles.gridCaravanas}>
                    {caravanas.map((caravana) => (
                        <div key={caravana.id} className={styles.roteiroCard}>
                            <img
                                src={caravana.imagemCapaLocalidade || caravana.imagensLocalidade?.[0] || '/caminho/para/imagem_padrao.jpg'}
                                alt={caravana.nomeLocalidade || 'Caravana'} 
                            />
                            <h4 className={styles.titulo}>{caravana.nomeLocalidade || 'Destino Indefinido'}</h4>
                            <p className={styles.data}>Data: {caravana.data ? new Date(caravana.data).toLocaleDateString() : 'N/A'}</p>
                            <p className={styles.vagas}>Vagas: {caravana.vagasDisponiveis === 0 ? 'Esgotado' : caravana.vagasDisponiveis}</p>
                            <button  className={styles.botao} onClick={() => openPopup(caravana)}>Ver Detalhes</button>
                        </div>
                    ))}
                </div>
            )}
            {isPopupOpen && (
                <PopupConfira
                    caravana={popupCaravana}
                    onClose={closePopup}
                    onCompraSucesso={handleCaravanaUpdate}
                />
            )}
        </div>
    );
}

export default Roteiros;