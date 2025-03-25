import React, { useState, useEffect } from 'react';
import * as api from '../../services/api';
import styles from './Eventos.module.css';
import PopupConfira from '../Popup/Popup';
import translateStatus from '../translate/translate';

function Eventos() {
    const [caravanas, setCaravanas] = useState([]);
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

    useEffect(() => {
        const fetchCaravanas = async () => {
            try {
                let caravanasData = await api.getCaravanas();
                console.log(caravanasData)
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


                setCaravanas(caravanasExibidas);
            } catch (err) {
                setError(err);
                console.error("Erro ao buscar caravanas:", err);
            }
        };

        fetchCaravanas();
    }, []);

    return (
        <>
            <section className={styles.eventos}>
                <h2>Confira!</h2>
                <div className={styles.gridEventos}>
                    {caravanas.map((caravana) => (
                        <div key={caravana.id} className={styles.eventoCard}>
                            <img
                                src={caravana.imagensLocalidade && caravana.imagensLocalidade.length > 0
                                    ? caravana.imagensLocalidade[0]
                                    : "./images/imagem_padrao.jpg"}
                                alt={caravana.nomeLocalidade}
                                className={styles.eventoCardImagem}
                            />
                            <div className={styles.eventoCardConteudo}>
                                <h3 className={styles.eventoCardNome}>{caravana.nomeLocalidade}</h3>
                                 <p><strong>Data: </strong>{new Date(caravana.data).toLocaleDateString()}</p>
                                <p><strong>Status:</strong> {translateStatus(caravana.status)}</p>
                                <button onClick={() => openPopup(caravana)} className={styles.eventoCardBotao}>
                                    Ver Detalhes
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </section>
            {isPopupOpen && (
                <PopupConfira caravana={selectedCaravana} onClose={closePopup} />
            )}
        </>
    );
}

export default Eventos;
