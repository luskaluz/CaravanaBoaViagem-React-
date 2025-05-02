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

    const formatarMesAno = (data) => {
        const opts = { month: 'long', year: 'numeric', timeZone: 'UTC' };
        const ma = new Date(data + 'T00:00:00Z').toLocaleDateString('pt-BR', opts);
        return ma.charAt(0).toUpperCase() + ma.slice(1);
    };

    const parseMesAno = (mesAno) => {
        const meses = {'janeiro':0,'fevereiro':1,'março':2,'abril':3,'maio':4,'junho':5,'julho':6,'agosto':7,'setembro':8,'outubro':9,'novembro':10,'dezembro':11};
        const partes = mesAno.toLowerCase().split(' de ');
        if (partes.length === 2 && meses[partes[0]] !== undefined && !isNaN(parseInt(partes[1]))) {
            return new Date(Date.UTC(parseInt(partes[1]), meses[partes[0]], 1));
        }
        console.warn("Falha ao parsear mesAno:", mesAno);
        return new Date();
    };

    const agruparPorMesAno = (caravanasParaAgrupar) => {
        const ordenado = [...caravanasParaAgrupar].sort((a, b) => new Date(a.data) - new Date(b.data));
        return ordenado.reduce((acc, c) => {
            const mesAnoFormatado = formatarMesAno(c.data);
            if (!acc[mesAnoFormatado]) acc[mesAnoFormatado] = [];
            acc[mesAnoFormatado].push(c);
            return acc;
        }, {});
    };

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


    const buscarCaravanas = useCallback(async () => {
        setLoading(true); setError(null);
        try {
            let caravanasData = await api.getCaravanas();
            const hoje = new Date(); hoje.setHours(0, 0, 0, 0);

            const caravanasFiltradas = caravanasData.filter(caravana => {
                const dataViagem = new Date(caravana.data + 'T00:00:00Z');
                const dataFechamento = caravana.dataFechamentoVendas ? new Date(caravana.dataFechamentoVendas + 'T23:59:59Z') : null;

                const disponibilidade = calcularDisponibilidade(caravana);

                const isFutura = dataViagem >= hoje;
                const isVendaAberta = !dataFechamento || hoje < dataFechamento;
                const temVagaCliente = disponibilidade.capacidadeTotalExibida > 0 && disponibilidade.vagasCliente > 0;
                const isStatusValido = caravana.status === "confirmada" || caravana.status === "nao_confirmada";

                return isFutura && isVendaAberta && temVagaCliente && isStatusValido;
            });

            caravanasFiltradas.sort((a, b) => new Date(a.data) - new Date(b.data));
            setCaravanas(caravanasFiltradas);
            setCaravanasPorMes(agruparPorMesAno(caravanasFiltradas));

        } catch (error) {
            setError(error);
            console.error(error);
            toast.error("Erro ao carregar roteiros.");
        }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { buscarCaravanas(); }, [buscarCaravanas]);

    const handleCaravanaUpdate = useCallback(() => {
         buscarCaravanas();
        toast.success("Ingresso(s) comprado(s)!");
        closePopup();
    }, [buscarCaravanas]);

    if (error && Object.keys(caravanasPorMes).length === 0) return <div className={styles.error}>Erro ao carregar roteiros. Tente novamente mais tarde.</div>;

    return (
        <div className={styles.container}>
            <ToastContainer position="top-right" autoClose={3000} hideProgressBar={false} newestOnTop={false} closeOnClick rtl={false} pauseOnFocusLoss draggable pauseOnHover theme="light"/>
            <h1>Roteiros</h1>
            {loading && <p className={styles.loading}>Carregando...</p>}
            {!loading && Object.keys(caravanasPorMes).length === 0 && !error && ( <p className={styles.nenhumaCaravana}>Nenhuma caravana futura disponível no momento.</p> )}
            {!loading && Object.keys(caravanasPorMes).length > 0 && (
                <div className={styles.mesesContainer}>
                    {Object.entries(caravanasPorMes)
                        .sort(([mesAnoA], [mesAnoB]) => parseMesAno(mesAnoA) - parseMesAno(mesAnoB))
                        .map(([mesAno, caravanasDoMes]) => (
                            <div key={mesAno} className={styles.mesLinha}>
                                <h2 className={styles.mesTitulo}>{mesAno}</h2>
                                <div className={styles.caravanasContainer}>
                                    {caravanasDoMes.map((caravana) => {
                                         const disponibilidade = calcularDisponibilidade(caravana);
                                         return (
                                             <div key={caravana.id} className={styles.roteiroCard}>
                                                 <img src={caravana.imagemCapaLocalidade || caravana.imagensLocalidade?.[0] || './images/imagem_padrao.jpg'} alt={caravana.nomeLocalidade || 'Caravana'} className={styles.cardImage}/>
                                                 <div className={styles.cardContent}>
                                                     <h4 className={styles.titulo}>{caravana.nomeLocalidade || 'Destino Indefinido'}</h4>
                                                     <p className={styles.data}>Data: {caravana.data ? new Date(caravana.data + 'T00:00:00Z').toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : 'N/A'}</p>
                                                     <p className={styles.capacidade}>Capacidade Total: {disponibilidade.capacidadeTotalExibida > 0 ? disponibilidade.capacidadeTotalExibida : 'A definir'}</p>
                                                     <p className={styles.vagas}>Vagas (Clientes): {disponibilidade.capacidadeTotalExibida === 0 ? 'A definir' : (disponibilidade.vagasCliente === 0 ? 'Esgotado' : disponibilidade.vagasCliente)}</p>
                                                     <p className={styles.preco}>{caravana.preco ? `R$ ${caravana.preco.toFixed(2)}` : 'Preço a definir'}</p>
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