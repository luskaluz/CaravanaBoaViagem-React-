import React, { useState, useEffect } from 'react';
import styles from './DetalhesCaravanaUsuario.module.css';
import * as api from '../../services/api'; // Ainda usado para descrição da localidade
import translateStatus from '../translate/translate';

function DetalhesCaravanaUsuario({ caravana }) {
    const [descricaoLocalidade, setDescricaoLocalidade] = useState('');
    const [isLoadingDesc, setIsLoadingDesc] = useState(false);
    // REMOVIDO: const [funcionarios, setFuncionarios] = useState([]);
    // REMOVIDO: const [loadingFuncionarios, setLoadingFuncionarios] = useState(true);
    // REMOVIDO: const [errorFuncionarios, setErrorFuncionarios] = useState(null);

    useEffect(() => {
        const fetchDescricao = async () => {
            if (caravana && caravana.localidadeId) {
                setIsLoadingDesc(true);
                try {
                    const localidadeData = await api.getDescricaoLocalidade(caravana.localidadeId);
                    setDescricaoLocalidade(localidadeData.descricao || '');
                } catch (error) { console.error(error); setDescricaoLocalidade('Erro ao carregar descrição.'); }
                finally { setIsLoadingDesc(false); }
            } else { setDescricaoLocalidade('N/A'); }
        };
        if (caravana) fetchDescricao();
    }, [caravana]);

    const formatarDataHora = (dateTimeString) => {
        if (!dateTimeString) return 'A definir';
        try {
            const dt = new Date(dateTimeString);
            if (!isNaN(dt.getTime())) {
                return dt.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
            }
        } catch (e) { console.warn("Erro ao formatar data/hora:", dateTimeString); }
        return 'Inválido';
    };

    if (!caravana) return <div className={styles.container}>Selecione uma caravana para ver os detalhes.</div>;

    const transporteDefinido = caravana.transporteDefinidoManualmente || caravana.transporteAutoDefinido;

    return (
        <div className={styles.container}>
            <h2 className={styles.title}>Detalhes da Sua Caravana</h2>
            {(caravana.imagemCapaLocalidade || (caravana.imagensLocalidade && caravana.imagensLocalidade.length > 0)) && (
                <img
                    src={caravana.imagemCapaLocalidade || caravana.imagensLocalidade[0]}
                    alt={caravana.nomeLocalidade || 'Localidade'}
                    className={styles.image}
                    onError={(e) => {
                         e.target.onerror = null;
                         if (caravana.imagensLocalidade && caravana.imagensLocalidade.length > 1 && e.target.src !== caravana.imagensLocalidade[1]) {
                            e.target.src = caravana.imagensLocalidade[1];
                         } else {
                            e.target.src = "./images/imagem_padrao.jpg";
                         }
                    }}
                />
            )}
            <p className={styles.infoItem}><strong>Localidade:</strong> {caravana.nomeLocalidade || 'N/A'}</p>
            <p className={styles.infoItem}><strong>Data Viagem: </strong>{caravana.data ? new Date(caravana.data + 'T00:00:00Z').toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : 'N/A'}</p>
            <p className={styles.infoItem}><strong>Ponto de Encontro:</strong> {caravana.pontoEncontro || 'A definir (verifique próximo à data)'}</p>
            <p className={styles.infoItem}><strong>Horário Saída: </strong> {caravana.horarioSaida || 'A definir'}</p>
            <p className={styles.infoItem}><strong>Retorno Estimado:</strong> {formatarDataHora(caravana.dataHoraRetorno)}</p>
            <p className={styles.infoItem}><strong>Ingressos Comprados por você:</strong> {caravana.quantidadeTotalUsuario || 'N/A'}</p>
            <p className={styles.infoItem}><strong>Status:</strong> {translateStatus(caravana.status)}</p>

            <div className={styles.infoSection}>
                 <h3>Descrição da Localidade</h3>
                {isLoadingDesc ? <p>Carregando...</p> : <p className={styles.descricao}>{descricaoLocalidade || 'Sem descrição disponível.'}</p>}
            </div>

            <div className={styles.infoSection}>
                <h3>Equipe Prevista</h3>
                {/* Mostra o nome do guia se o objeto 'guia' estiver na caravana, senão "A ser confirmado" */}
                <p className={styles.infoItem}><strong>Guia:</strong> {caravana.guia?.nome || 'A ser confirmado'}</p>

                {/* Se o transporte estiver definido, mostra uma mensagem genérica sobre admin/motorista */}
                {transporteDefinido && caravana.transportesFinalizados && caravana.transportesFinalizados.length > 0 ? (
                    <>
                        <p className={styles.infoItem}><strong>Administrador(es) da Viagem:</strong> Confirmado(s)</p>
                        <p className={styles.infoItem}><strong>Motorista(s):</strong> Confirmado(s)</p>
                    </>
                ) : (
                    <>
                        <p className={styles.infoItem}><strong>Administrador:</strong> A ser confirmado</p>
                        <p className={styles.infoItem}><strong>Motorista:</strong> A ser confirmado</p>
                    </>
                )}
            </div>

             {transporteDefinido && caravana.transportesFinalizados && caravana.transportesFinalizados.length > 0 && (
                 <div className={styles.transportInfo}>
                    <h4>Transporte Designado</h4>
                    <p>Sua alocação específica no veículo será informada pela equipe mais próximo à data da viagem. Verifique seus e-mails para atualizações.</p>
                 </div>
            )}
        </div>
    );
}

export default DetalhesCaravanaUsuario;