import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as api from '../../services/api'; 
import styles from './Carrossel.module.css';
import PopupConfira from '../Popup/Popup'; 

function Carrossel() {
    const [localidades, setLocalidades] = useState([]);
    const [indiceAtual, setIndiceAtual] = useState(0);
    const [error, setError] = useState(null);
    const [larguraSlide, setLarguraSlide] = useState(0);
    const slidesRef = useRef(null);
    const [popupLocalidade, setPopupLocalidade] = useState(null); 
    const [isPopupOpen, setIsPopupOpen] = useState(false);

    const calcularLarguraSlide = useCallback(() => {
        if (slidesRef.current && localidades.length > 0) {
            const containerWidth = slidesRef.current.offsetWidth;
            let numSlidesVisiveis = 3;
            if (containerWidth < 640) numSlidesVisiveis = 1;
            else if (containerWidth < 768) numSlidesVisiveis = 2;
            setLarguraSlide(containerWidth / numSlidesVisiveis);
        }
    }, [localidades]);

    useEffect(() => {
        const buscarLocalidades = async () => {
            try {
                const localidadesData = await api.getLocalidades();
                setLocalidades(localidadesData);
            } catch (err) {
                setError(err);
            }
        };

        buscarLocalidades();
    }, []);

    useEffect(() => {
        const observer = new ResizeObserver(calcularLarguraSlide);
        if (slidesRef.current) observer.observe(slidesRef.current);
        return () => observer.disconnect();
    }, [calcularLarguraSlide]);

    useEffect(() => {
        if (localidades.length > 0) {
            const timer = setTimeout(calcularLarguraSlide, 50);
            return () => clearTimeout(timer);
        }
    }, [localidades, calcularLarguraSlide]);

    const proximaLocalidade = () => {
        setIndiceAtual((prevIndice) => (prevIndice + 1) % localidades.length);
    };

    const localidadeAnterior = () => {
        setIndiceAtual((prevIndice) => prevIndice === 0 ? localidades.length - 1 : prevIndice - 1);
    };

    const openPopup = (localidade) => {
        setPopupLocalidade(localidade);
        setIsPopupOpen(true);
    };

    const closePopup = () => {
        setPopupLocalidade(null);
        setIsPopupOpen(false);
    };

    if (error) return <div>Erro ao carregar localidades: {error.message}</div>;
    if (!localidades || localidades.length === 0) return <div>Nenhuma localidade encontrada.</div>;

    const translateX = -indiceAtual * larguraSlide;

    return (
        <>
            <section className={styles.destinos}>
                <h2>LOCALIDADES</h2>
                <div className={styles.carrosselContainer}>
                    <button onClick={localidadeAnterior} className={styles.botaoAnterior}>&lt;</button>
                    <div className={styles.slidesContainer} ref={slidesRef}>
                        <div className={styles.slides} style={{
                            transform: `translateX(${translateX}px)`,
                            width: `${larguraSlide * localidades.length}px`
                        }}>
                            {localidades.map((localidade) => (
                                <div key={localidade.id} className={styles.slide} style={{ width: `${larguraSlide}px` }}>
                                    <div className={styles.card}>


                                        <img
                                            src={localidade.imagens?.[0] || '/caminho/para/imagem_padrao.jpg'}
                                            alt={localidade.nome}
                                            className={styles.cardImagem}
                                        />
                                        <h4 className={styles.cardTitulo}>{localidade.nome}</h4>

                                        <button onClick={() => openPopup(localidade)} className={styles.botaoVerDetalhes}>Ver Detalhes</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                    <button onClick={proximaLocalidade} className={styles.botaoProximo}>&gt;</button>
                </div>
            </section>
            {isPopupOpen && (
                <PopupConfira localidade={popupLocalidade} onClose={closePopup} isLocalidade={true} />
            )}
        </>
    );
}

export default Carrossel;
