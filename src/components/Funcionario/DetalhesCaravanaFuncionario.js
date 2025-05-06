import React, { useState, useEffect } from 'react';
import styles from '../Usuario/DetalhesCaravanaUsuario.module.css'; // Reutiliza estilos do usuário
import * as api from '../../services/api';
import translateStatus from '../translate/translate'; // Importa translateStatus

const PLACEHOLDER_IMAGE_URL = "https://via.placeholder.com/80x120?text=Foto";

function DetalhesCaravanaFuncionario({ caravana }) {
    const [descricao, setDescricao] = useState('');
    const [isLoadingDesc, setIsLoadingDesc] = useState(false);
    const [funcionarios, setFuncionarios] = useState([]); // Para buscar nomes
    const [loadingFuncionarios, setLoadingFuncionarios] = useState(true);

    useEffect(() => {
        const fetchFuncionarios = async () => {
            if (!caravana) return;
            setLoadingFuncionarios(true);
            try {
                const funcData = await api.getFuncionarios();
                setFuncionarios(funcData);
            } catch (err) { console.error("Erro ao buscar funcionários:", err); }
            finally { setLoadingFuncionarios(false); }
        };
        fetchFuncionarios();
    }, [caravana]);

    useEffect(() => {
        const fetchDescricao = async () => {
            if (caravana && caravana.localidadeId) {
                setIsLoadingDesc(true);
                try {
                    const descricaoData = await api.getDescricaoLocalidade(caravana.localidadeId);
                    setDescricao(descricaoData.descricao || '');
                } catch (err) { console.error(err); setDescricao('Erro ao carregar.'); }
                finally { setIsLoadingDesc(false); }
            } else { setDescricao('N/A'); }
        };
        fetchDescricao();
    }, [caravana]);

    const getNomeFuncionario = (uid) => {
        if (!uid) return 'Não definido';
        if (loadingFuncionarios) return 'Carregando...';
        const func = funcionarios.find(f => (f.uid || f.id) === uid);
        return func ? func.nome : `UID: ${uid} (Não encontrado)`;
    };

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


    // Subcomponente para exibir informações BÁSICAS do funcionário
    const EmployeeInfoBasic = ({ uid, role }) => {
        const nome = getNomeFuncionario(uid);
        const displayText = uid ? nome : 'Não Definido';
       return (
            <p className={styles.infoItem}><strong>{role}:</strong> {displayText}</p>
       );
   };

    if (!caravana) return <div className={styles.container}>Caravana não encontrada.</div>;

    const vagasOcupadas = caravana.vagasOcupadas || 0;
    const capacidadeDefinida = caravana.transporteDefinidoManualmente || caravana.transporteAutoDefinido;
    const capacidadeFinal = caravana.capacidadeFinalizada || 0;


    return (
        <div className={styles.container}>
            <h2 className={styles.title}>Detalhes da Caravana</h2>
            {(caravana.imagemCapaLocalidade || (caravana.imagensLocalidade && caravana.imagensLocalidade.length > 0)) && (
                <img
                    src={caravana.imagemCapaLocalidade || caravana.imagensLocalidade[0]}
                    alt={caravana.nomeLocalidade || 'Localidade'}
                    className={styles.image}
                    onError={(e) => { e.target.onerror = null; e.target.src="./images/imagem_padrao.jpg" }}
                />
            )}
            <p className={styles.infoItem}><strong>Localidade:</strong> {caravana.nomeLocalidade || 'N/A'}</p>
            <p className={styles.infoItem}><strong>Data Viagem: </strong>{caravana.data ? new Date(caravana.data + 'T00:00:00Z').toLocaleDateString('pt-BR', {timeZone: 'UTC'}) : 'N/A'}</p>
            <p className={styles.infoItem}><strong>Ponto de Encontro:</strong> {caravana.pontoEncontro || 'A definir'}</p>
            <p className={styles.infoItem}><strong>Horário Saída: </strong> {caravana.horarioSaida || 'A definir'}</p>
            <p className={styles.infoItem}><strong>Retorno Estimado:</strong> {formatarDataHora(caravana.dataHoraRetorno)}</p>
            <p className={styles.infoItem}><strong>Status:</strong> {translateStatus(caravana.status)}</p>

            <div className={styles.infoSection}>
                 <h3>Descrição da Localidade</h3>
                {isLoadingDesc ? <p>Carregando...</p> : <p className={styles.descricao}>{descricao || 'Sem descrição disponível.'}</p>}
            </div>

             {/* Mostra a equipe PRINCIPAL definida (se houver) */}
             <div className={styles.infoSection}>
                 <h3>Equipe Principal</h3>
                 <EmployeeInfoBasic uid={caravana.administradorUid} role="Admin Principal"/>
                 <EmployeeInfoBasic uid={caravana.motoristaUid} role="Motorista Principal" />
                 <EmployeeInfoBasic uid={caravana.guiaUid} role="Guia" />
             </div>

             {/* Mostra detalhes dos veículos se definidos */}
             {capacidadeDefinida && Array.isArray(caravana.transportesFinalizados) && caravana.transportesFinalizados.length > 0 && (
                 <div className={styles.infoSection}>
                     <h3>Veículos e Responsáveis</h3>
                     {loadingFuncionarios && <p>Carregando nomes...</p>}
                     <ul>
                         {caravana.transportesFinalizados.map((v, index) => (
                             <li key={index} className={styles.vehicleListItem}>
                                 <strong>Veículo {index+1}: {v.nomeTipo}</strong> ({v.assentos} assentos)
                                 {v.placa && ` - Placa: ${v.placa}`} <br/>
                                 <span className={styles.responsible}>Admin: {getNomeFuncionario(v.administradorUid)}</span> <br/>
                                 <span className={styles.responsible}>Motorista: {getNomeFuncionario(v.motoristaUid)}</span>
                             </li>
                         ))}
                     </ul>
                     <p className={styles.infoItem}><strong>Capacidade Final:</strong> {capacidadeFinal}</p>
                 </div>
             )}

             {/* Mostra capacidade teórica se transporte NÃO definido */}
             {!capacidadeDefinida && (
                 <div className={styles.infoSection}>
                     <h3>Transporte (Pré-Definição)</h3>
                     <p className={styles.infoItem}><strong>Nº Máx. Veículos:</strong> {caravana.maximoTransportes || 'N/A'}</p>
                     <p className={styles.infoItem}><strong>Capacidade Máx. Teórica:</strong> {caravana.capacidadeMaximaTeorica || 'N/A'}</p>
                 </div>
             )}

             <div className={styles.infoSection}>
                <h3>Participantes</h3>
                <p className={styles.infoItem}><strong>Inscritos (Clientes):</strong> {vagasOcupadas}</p>
                {/* Vagas disponíveis para clientes é mais complexo aqui, talvez omitir ou simplificar */}
             </div>
        </div>
    );
}

export default DetalhesCaravanaFuncionario;