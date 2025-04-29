import React, { useState, useEffect, useCallback } from 'react';
import * as api from '../../services/api';
import PopupConfira from '../Popup/Popup';
import styles from './Roteiros.module.css';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import translateStatus from '../translate/translate';

function Roteiros() {
    const [caravanas, setCaravanas] = useState([]);
    const [caravanasPorMes, setCaravanasPorMes] = useState({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [popupCaravana, setPopupCaravana] = useState(null);
    const [isPopupOpen, setIsPopupOpen] = useState(false);

    const openPopup = (caravana) => { setPopupCaravana(caravana); setIsPopupOpen(true); };
    const closePopup = () => { setPopupCaravana(null); setIsPopupOpen(false); };
    const formatarMesAno = (data) => { const opts = { month: 'long', year: 'numeric' }; const ma = new Date(data + 'T00:00:00').toLocaleDateString('pt-BR', opts); return ma.charAt(0).toUpperCase() + ma.slice(1); };
    const parseMesAno = (mesAno) => { const [m, , a] = mesAno.split(' de '); const ms = {'janeiro':0,'fevereiro':1,'março':2,'abril':3,'maio':4,'junho':5,'julho':6,'agosto':7,'setembro':8,'outubro':9,'novembro':10,'dezembro':11}; return new Date(a, ms[m.toLowerCase()]); };
    const agruparPorMesAno = (caravanas) => { const ord = [...caravanas].sort((a,b)=>new Date(a.data)-new Date(b.data)); return ord.reduce((acc,c)=>{const ma=formatarMesAno(c.data); if(!acc[ma])acc[ma]=[]; acc[ma].push(c); return acc;},{}); };

    const buscarCaravanas = useCallback(async () => {
        setLoading(true); setError(null);
        try {
            let caravanasData = await api.getCaravanas();
            const hoje = new Date(); hoje.setHours(0, 0, 0, 0);

            const caravanasFiltradas = caravanasData.filter(caravana => {
                const dataViagem = new Date(caravana.data + 'T00:00:00');
                const dataFechamento = caravana.dataFechamentoVendas ? new Date(caravana.dataFechamentoVendas + 'T23:59:59') : null;
                const vagasOcupadasParticipantes = (caravana.vagasTotais || 0) - (caravana.vagasDisponiveis ?? (caravana.vagasTotais || 0));
                const vagasOcupadasTotal = Math.max(0, vagasOcupadasParticipantes) + (caravana.administradorUid ? 1 : 0);
                const capacidadeMaximaParaVenda = caravana.transporteAlocado ? (caravana.transporteAlocado.assentos || 0) : (caravana.maxCapacidadeDisponivel || 0);
                const isFutura = dataViagem >= hoje;
                const isVendaAberta = !dataFechamento || hoje < dataFechamento;
                const temVagaPotencial = vagasOcupadasTotal < capacidadeMaximaParaVenda;
                const isStatusValido = caravana.status === "confirmada" || caravana.status === "nao_confirmada";
                return isFutura && isVendaAberta && temVagaPotencial && isStatusValido;
            });

            caravanasFiltradas.sort((a, b) => new Date(a.data) - new Date(b.data));
            setCaravanas(caravanasFiltradas);
            setCaravanasPorMes(agruparPorMesAno(caravanasFiltradas));

        } catch (error) { setError(error); console.error(error); toast.error("Erro ao carregar roteiros."); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { buscarCaravanas(); }, [buscarCaravanas]);

    const handleCaravanaUpdate = useCallback((updatedCaravanaId) => {
         buscarCaravanas();
        toast.success("Ingresso(s) comprado(s)!");
        closePopup();
    }, [buscarCaravanas]);

    if (error && Object.keys(caravanasPorMes).length === 0) return <div className={styles.error}>Erro ao carregar roteiros. Tente novamente.</div>;

    return (
        <div className={styles.container}>
            <ToastContainer position="top-right" autoClose={3000} hideProgressBar={false} newestOnTop={false} closeOnClick rtl={false} pauseOnFocusLoss draggable pauseOnHover theme="light"/>
            <h1>Roteiros</h1>
            {loading && <p className={styles.loading}>Carregando...</p>}
            {!loading && Object.keys(caravanasPorMes).length === 0 && !error && ( <p className={styles.nenhumaCaravana}>Nenhuma caravana futura disponível.</p> )}
            {!loading && Object.keys(caravanasPorMes).length > 0 && (
                <div className={styles.mesesContainer}>
                    {Object.entries(caravanasPorMes)
                        .sort(([mesAnoA], [mesAnoB]) => parseMesAno(mesAnoA) - parseMesAno(mesAnoB))
                        .map(([mesAno, caravanasDoMes]) => (
                            <div key={mesAno} className={styles.mesLinha}>
                                <h2 className={styles.mesTitulo}>{mesAno}</h2>
                                <div className={styles.caravanasContainer}>
                                    {caravanasDoMes.map((caravana) => {
                                         const capacidadeMax = caravana.transporteAlocado ? (caravana.transporteAlocado.assentos || 0) : (caravana.maxCapacidadeDisponivel || 0);
                                         const vagasOcup = (caravana.vagasOcupadas || ((caravana.vagasTotais || 0) - (caravana.vagasDisponiveis ?? (caravana.vagasTotais || 0)))) + (caravana.administradorUid ? 1 : 0);
                                         const vagasDisp = Math.max(0, capacidadeMax - vagasOcup);
                                         return (
                                             <div key={caravana.id} className={styles.roteiroCard}>
                                                 <img src={caravana.imagemCapaLocalidade || caravana.imagensLocalidade?.[0] || './images/imagem_padrao.jpg'} alt={caravana.nomeLocalidade || 'Caravana'} className={styles.cardImage}/>
                                                 <div className={styles.cardContent}>
                                                     <h4 className={styles.titulo}>{caravana.nomeLocalidade || 'Indefinido'}</h4>
                                                     <p className={styles.data}>Data: {caravana.data ? new Date(caravana.data + 'T00:00:00').toLocaleDateString('pt-BR') : 'N/A'}</p>
                                                     <p className={styles.vagas}>Vagas: {vagasDisp === 0 ? 'Esgotado' : vagasDisp}</p>
                                                     <p className={styles.preco}>{caravana.preco ? `R$ ${caravana.preco.toFixed(2)}` : 'N/A'}</p>
                                                     <button className={styles.botao} onClick={() => openPopup(caravana)}> Ver Detalhes </button>
                                                 </div>
                                             </div>
                                         );
                                      })}
                                </div>
                            </div>
                        ))}
                </div>
            )}
            {isPopupOpen && ( <PopupConfira caravana={popupCaravana} onClose={closePopup} onCompraSucesso={handleCaravanaUpdate}/> )}
        </div>
    );
}

export default Roteiros;