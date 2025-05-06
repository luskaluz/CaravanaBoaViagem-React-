import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as api from '../../services/api';
import styles from './Carrossel.module.css';
import PopupConfira from '../Popup/Popup';
import LoadingSpinner from '../LoadingSpinner/LoadingSpinner'; // <<< Importar

function Carrossel() {
    const [localidades, setLocalidades] = useState([]);
    const [indiceAtual, setIndiceAtual] = useState(0);
    const [loading, setLoading] = useState(true); // <<< Adicionar estado de loading
    const [error, setError] = useState(null);
    const [larguraSlide, setLarguraSlide] = useState(0);
    const slidesRef = useRef(null);
    const [popupLocalidade, setPopupLocalidade] = useState(null);
    const [isPopupOpen, setIsPopupOpen] = useState(false);

    const calcularLarguraSlide = useCallback(() => {
        if (slidesRef.current && localidades.length > 0) {
            const containerWidth = slidesRef.current.offsetWidth;
            let numSlidesVisiveis = 3;
            if (window.innerWidth < 640) numSlidesVisiveis = 1; // Usa window.innerWidth para responsividade inicial
            else if (window.innerWidth < 768) numSlidesVisiveis = 2;
            setLarguraSlide(containerWidth / numSlidesVisiveis);
        }
    }, [localidades]);

    useEffect(() => {
        const buscarLocalidades = async () => {
            setLoading(true); // <<< Inicia loading
            setError(null);
            try {
                const localidadesData = await api.getLocalidades();
                setLocalidades(localidadesData);
            } catch (err) {
                setError(err);
                console.error("Erro ao carregar localidades (Carrossel):", err);
            } finally {
                setLoading(false); // <<< Finaliza loading
            }
        };
        buscarLocalidades();
    }, []);

    useEffect(() => {
        calcularLarguraSlide(); // Calcula largura inicial
        window.addEventListener('resize', calcularLarguraSlide); // Recalcula no resize
        return () => window.removeEventListener('resize', calcularLarguraSlide);
    }, [calcularLarguraSlide]);

    // Recalcula se as localidades mudarem (após o fetch)
     useEffect(() => {
         if (localidades.length > 0) {
             calcularLarguraSlide();
         }
     }, [localidades, calcularLarguraSlide]);


    const proximaLocalidade = () => {
         if (localidades.length === 0) return;
        setIndiceAtual((prevIndice) => (prevIndice + 1) % localidades.length);
    };

    const localidadeAnterior = () => {
        if (localidades.length === 0) return;
        setIndiceAtual((prevIndice) => prevIndice === 0 ? localidades.length - 1 : prevIndice - 1);
    };

    const openPopup = (localidade) => { setPopupLocalidade(localidade); setIsPopupOpen(true); };
    const closePopup = () => { setPopupLocalidade(null); setIsPopupOpen(false); };

    // --- RENDERIZAÇÃO CONDICIONAL COM SPINNER ---
    const renderCarrosselContent = () => {
         if (loading) {
             return <LoadingSpinner mensagem="Carregando localidades..." />; // <<< Usa Spinner
         }
         if (error) {
             return <div className={styles.error}>Erro ao carregar localidades: {error.message}</div>;
         }
         if (localidades.length === 0) {
             return <div className={styles.nenhumaLocalidade}>Nenhuma localidade encontrada.</div>;
         }

         const translateX = -indiceAtual * larguraSlide;
         const totalWidth = larguraSlide * localidades.length;

         return (
             <div className={styles.carrosselContainer}>
                 <button onClick={localidadeAnterior} className={styles.botaoAnterior} disabled={localidades.length <= 1}>&lt;</button>
                 <div className={styles.slidesContainer} ref={slidesRef}>
                     <div className={styles.slides} style={{ transform: `translateX(${translateX}px)`, width: `${totalWidth}px` }}>
                         {localidades.map((localidade) => (
                             <div key={localidade.id} className={styles.slide} style={{ width: `${larguraSlide}px` }}>
                                 <div className={styles.card}>
                                     <img
                                         src={localidade.imagens?.[0] || './images/imagem_padrao.jpg'}
                                         alt={localidade.nome}
                                         className={styles.cardImagem}
                                         onError={(e) => { e.target.onerror = null; e.target.src = './images/imagem_padrao.jpg';}}
                                     />
                                     <h4 className={styles.cardTitulo}>{localidade.nome}</h4>
                                     <button onClick={() => openPopup(localidade)} className={styles.botaoVerDetalhes}>Ver Detalhes</button>
                                 </div>
                             </div>
                         ))}
                     </div>
                 </div>
                 <button onClick={proximaLocalidade} className={styles.botaoProximo} disabled={localidades.length <= 1}>&gt;</button>
             </div>
         );
    };
     // --- FIM RENDERIZAÇÃO CONDICIONAL ---

    return (
        <>
            <section className={styles.destinos}>
                <h2>LOCALIDADES</h2>
                {renderCarrosselContent()} {/* <<< Chama a função de renderização */}
            </section>
            {isPopupOpen && (
                <PopupConfira localidade={popupLocalidade} onClose={closePopup} isLocalidade={true} />
            )}
        </>
    );
}

export default Carrossel;

