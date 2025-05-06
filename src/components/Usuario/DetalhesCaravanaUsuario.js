import React, { useState, useEffect } from 'react';
import styles from './DetalhesCaravanaUsuario.module.css';
import * as api from '../../services/api';
import translateStatus from '../translate/translate'; // Importa translateStatus

const PLACEHOLDER_IMAGE_URL = "https://via.placeholder.com/80x120?text=Foto";

function DetalhesCaravanaUsuario({ caravana, onClose }) {
    const [descricaoLocalidade, setDescricaoLocalidade] = useState('');
    const [isLoadingDesc, setIsLoadingDesc] = useState(false);
    const [funcionarios, setFuncionarios] = useState([]); // Estado para buscar nomes
    const [loadingFuncionarios, setLoadingFuncionarios] = useState(true);


    // Busca funcionários para exibir nomes
    useEffect(() => {
        const fetchFuncionarios = async () => {
             if(!caravana) return; // Só busca se tiver caravana
            setLoadingFuncionarios(true);
            try {
                const funcData = await api.getFuncionarios();
                setFuncionarios(funcData);
            } catch (err) { console.error("Erro ao buscar funcionários:", err); }
            finally { setLoadingFuncionarios(false); }
        };
        fetchFuncionarios();
    }, [caravana]); // Depende da caravana


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
        fetchDescricao();
    }, [caravana]);

     // Função para buscar nome do funcionário pelo UID
     const getNomeFuncionario = (uid) => {
        if (!uid) return 'Não confirmado';
        if (loadingFuncionarios) return 'Carregando...';
        const func = funcionarios.find(f => (f.uid || f.id) === uid);
        return func ? func.nome : 'Não encontrado';
    };

    // Formata data/hora
    const formatarDataHora = (dateTimeString) => {
        if (!dateTimeString) return 'A definir';
        try {
            const dt = new Date(dateTimeString);
            if (!isNaN(dt.getTime())) {
                return dt.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
            }
        } catch (e) { console.warn("Erro ao formatar data/hora:", dateTimeString); }
        return 'Inválido';
    };

    // Subcomponente para exibir info básica do funcionário (sem detalhes de contato)
    const EmployeeInfoBasic = ({ uid, role }) => {
         const nome = getNomeFuncionario(uid);
         const displayText = uid ? nome : 'Não Confirmado';

        return (
             <p className={styles.infoItem}><strong>{role}:</strong> {displayText}</p>
        );
    };


    if (!caravana) return <div className={styles.container}>Selecione uma caravana para ver os detalhes.</div>;

    return (
        <div className={styles.container}>

            <h2 className={styles.title}>Detalhes da Caravana</h2>
            {/* Usa imagemCapaLocalidade como fallback primário */}
            {(caravana.imagemCapaLocalidade || (caravana.imagensLocalidade && caravana.imagensLocalidade.length > 0)) && (
                <img
                    src={caravana.imagemCapaLocalidade || caravana.imagensLocalidade[0]}
                    alt={caravana.nomeLocalidade || 'Localidade'}
                    className={styles.image}
                    onError={(e) => {
                         e.target.onerror = null;
                         if (caravana.imagensLocalidade && caravana.imagensLocalidade.length > 1 && e.target.src !== caravana.imagensLocalidade[1]) {
                            e.target.src = caravana.imagensLocalidade[1]; // Tenta a segunda imagem
                         } else {
                            e.target.src = "./images/imagem_padrao.jpg"; // Fallback final
                         }
                    }}
                />
            )}
            <p className={styles.infoItem}><strong>Localidade:</strong> {caravana.nomeLocalidade || 'N/A'}</p>
            <p className={styles.infoItem}><strong>Data Viagem: </strong>{caravana.data ? new Date(caravana.data + 'T00:00:00Z').toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : 'N/A'}</p>
             {/* --- NOVOS CAMPOS EXIBIDOS --- */}
            <p className={styles.infoItem}><strong>Ponto de Encontro:</strong> {caravana.pontoEncontro || 'A definir (verifique próximo à data)'}</p>
            <p className={styles.infoItem}><strong>Horário Saída: </strong> {caravana.horarioSaida || 'A definir'}</p>
            <p className={styles.infoItem}><strong>Retorno Estimado:</strong> {formatarDataHora(caravana.dataHoraRetorno)}</p>
             {/* --- FIM NOVOS CAMPOS --- */}
            <p className={styles.infoItem}><strong>Ingressos Comprados por você:</strong> {caravana.quantidadeTotalUsuario || 'N/A'}</p>
            <p className={styles.infoItem}><strong>Status:</strong> {translateStatus(caravana.status)}</p>

            <div className={styles.infoSection}>
                 <h3>Descrição da Localidade</h3>
                {isLoadingDesc ? <p>Carregando...</p> : <p className={styles.descricao}>{descricaoLocalidade || 'Sem descrição disponível.'}</p>}
            </div>

            <div className={styles.infoSection}>
                <h3>Equipe (Confirmada Próximo à Data)</h3>
                <EmployeeInfoBasic uid={caravana.administradorUid} role="Administrador" />
                <EmployeeInfoBasic uid={caravana.motoristaUid} role="Motorista" />
                <EmployeeInfoBasic uid={caravana.guiaUid} role="Guia" />
                {(caravana.transporteDefinidoManualmente || caravana.transporteAutoDefinido) && caravana.transportesFinalizados && caravana.transportesFinalizados.length > 0 && (
                     <div className={styles.transportInfo}>
                        <h4>Seu Transporte:</h4>

                        <p>Detalhes do veículo (tipo, placa) serão informados.</p>
                     </div>
                )}
            </div>
        </div>
    );
}

export default DetalhesCaravanaUsuario;