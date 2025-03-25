// src/pages/Roteiros.js
import React, { useState, useEffect } from 'react';
import * as api from '../../services/api';
import PopupConfira from '../Popup/Popup';
import styles from './Roteiros.module.css';

function Roteiros() {
    const [caravanas, setCaravanas] = useState([]);
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

    useEffect(() => {
        const buscarCaravanas = async () => {
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


            } catch (error) {
                setError(error);
                console.error("Erro ao buscar caravanas:", error); 
            }
        };

        buscarCaravanas();
    }, []);



    return (
        <div className={styles.container}> 
            <h1>Roteiros</h1>
            <div className={styles.gridCaravanas}>
                {caravanas.map((caravana) => (
                    <div key={caravana.id} className={styles.roteiroCard}>
                        <img
                            src={caravana.imagensLocalidade?.[0] || '/caminho/para/imagem_padrao.jpg'}
                            alt={caravana.nomeLocalidade}
                        />
                        <h4 className={styles.titulo}>{caravana.nomeLocalidade}</h4>
                        <p className={styles.data}>Data: {new Date(caravana.data).toLocaleDateString()}</p>
                      <p className={styles.vagas}>Vagas: {caravana.vagasDisponiveis === 0 ? 'Esgotado' : caravana.vagasDisponiveis}</p>
                        <button  className={styles.botao} onClick={() => openPopup(caravana)}>Ver Detalhes</button>
                    </div>
                ))}
            </div>
            {isPopupOpen && (
                <PopupConfira caravana={popupCaravana} onClose={closePopup} />
            )}
        </div>
    );
}

export default Roteiros;
