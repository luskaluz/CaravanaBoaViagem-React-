import React, { useState, useEffect } from 'react';
import styles from './DetalhesCaravanaAdmin.module.css';
import * as api from '../../services/api';
// Removida importação do AlocacaoManualModal daqui

const PLACEHOLDER_IMAGE_URL = "https://via.placeholder.com/80x120?text=Foto";

function DetalhesCaravanaAdmin({ caravana, onClose, onCaravanaUpdate }) {
    const [descricao, setDescricao] = useState('');
    const [isLoadingDesc, setIsLoadingDesc] = useState(false);
    const [showDefineTransporte, setShowDefineTransporte] = useState(false);
    const [tiposTransporte, setTiposTransporte] = useState([]);
    const [selectedTransporteTipoId, setSelectedTransporteTipoId] = useState('');
    const [placaInput, setPlacaInput] = useState('');
    const [savingTransporte, setSavingTransporte] = useState(false);
    const [defineTransporteError, setDefineTransporteError] = useState(null);

    const formatDate = (dateString) => {
        if (!dateString) return 'N/A';
        try { return new Date(dateString + 'T00:00:00').toLocaleDateString('pt-BR'); }
        catch (e) { return 'Data Inválida'; }
    };

    useEffect(() => {
        const fetchDescricao = async () => {
            if (caravana && caravana.localidadeId) {
                setIsLoadingDesc(true);
                try { const data = await api.getDescricaoLocalidade(caravana.localidadeId); setDescricao(data.descricao || ''); }
                catch (error) { console.error(error); setDescricao('Erro.'); }
                finally { setIsLoadingDesc(false); }
            } else { setDescricao('N/A'); }
        };
        fetchDescricao();
    }, [caravana]);

    const translateStatus = (status) => {
        switch (status) {
            case 'confirmada': return 'Confirmada'; case 'nao_confirmada': return 'Não Confirmada';
            case 'cancelada': return 'Cancelada'; case 'concluida': return 'Concluída';
            case 'erro_alocacao_transporte': return 'Erro Alocação'; default: return 'Desconhecido';
        }
    };

    const EmployeeInfoDetailed = ({ employee, role, originalUid }) => {
        if (!employee) { return ( <div className={`${styles.employeeBlock} ${styles.employeeNotConfirmed}`}><div className={styles.employeeDetails}><p className={styles.infoStrong}><strong>{role}:</strong> Não Confirmado</p></div></div> ); }
        if (employee.error) { return ( <div className={styles.employeeBlock}><img src={PLACEHOLDER_IMAGE_URL} alt={role} className={styles.employeePhoto}/><div className={styles.employeeDetails}><p className={styles.infoStrong}><strong>{role}:</strong> Erro</p><p className={styles.infoSmall}>UID: {originalUid || 'N/A'}</p></div></div> ); }
        return ( <div className={styles.employeeBlock}> <img src={employee.fotoUrl || PLACEHOLDER_IMAGE_URL} alt={employee.nome || role} className={styles.employeePhoto} onError={(e) => { e.target.onerror = null; e.target.src=PLACEHOLDER_IMAGE_URL }}/> <div className={styles.employeeDetails}> <p className={styles.infoStrong}><strong>{role}:</strong> {employee.nome || 'N/A'}</p> <p className={styles.infoSmall}><strong>Email:</strong> {employee.email || 'N/A'}</p> <p className={styles.infoSmall}><strong>Telefone:</strong> {employee.telefone || 'N/A'}</p> </div> </div> );
    };

    useEffect(() => {
        if (showDefineTransporte) {
            const fetchTipos = async () => {
                try {
                    const data = await api.getTransportes(); setTiposTransporte(data);
                    if (caravana?.transporteAlocado) { setSelectedTransporteTipoId(caravana.transporteAlocado.id || ''); setPlacaInput(caravana.transporteAlocado.placa || ''); }
                    else { setSelectedTransporteTipoId(''); setPlacaInput(''); }
                } catch (err) { setDefineTransporteError("Erro ao carregar tipos."); console.error(err); }
            };
            fetchTipos();
        }
    }, [showDefineTransporte, caravana]);

     const handleOpenDefineTransporte = () => { setDefineTransporteError(null); setShowDefineTransporte(true); };
     const handleCloseDefineTransporte = () => { setShowDefineTransporte(false); setSelectedTransporteTipoId(''); setPlacaInput(''); setDefineTransporteError(null); };

     const handleSalvarTransporteDefinido = async () => {
         if (!selectedTransporteTipoId || !placaInput) { setDefineTransporteError("Selecione o tipo e digite a placa."); return; }
         setSavingTransporte(true); setDefineTransporteError(null);
         try {
             await api.definirTransportePlacaMotorista(caravana.id, selectedTransporteTipoId, placaInput, null); // <<< USA A FUNÇÃO CORRETA, motoristaUid é null aqui
             alert("Transporte definido!"); handleCloseDefineTransporte();
             if (onCaravanaUpdate) onCaravanaUpdate();
         } catch (err) { console.error(err); setDefineTransporteError(err.message || "Erro."); }
         finally { setSavingTransporte(false); }
     };

    if (!caravana) return null;

    const formatCurrency = (value) => `R$ ${(parseFloat(value) || 0).toFixed(2)}`;
    const formatPercentage = (value) => `${(parseFloat(value) || 0).toFixed(1)}%`;
    const formatRoi = (value) => (value === Infinity ? 'N/A' : formatPercentage(value));
    const vagasOcupadas = caravana.vagasOcupadas || 0;
    const capacidadeReal = caravana.transporteAlocado?.assentos || caravana.vagasTotais || 0;
    const vagasDisponiveisReais = Math.max(0, capacidadeReal - (vagasOcupadas + (caravana.administradorUid ? 1 : 0)));
    const ocupacaoPercentual = capacidadeReal > 0 ? (((vagasOcupadas + (caravana.administradorUid ? 1 : 0)) / capacidadeReal) * 100) : 0;


    return (
        <div className={styles.container}>
            <div className={styles.modalContent}>
                <h2 className={styles.title}>Detalhes da Caravana</h2>
                <div className={styles.card}>
                     {caravana.imagensLocalidade?.[0] && ( <img src={caravana.imagensLocalidade[0]} alt={caravana.nomeLocalidade || 'Localidade'} className={styles.cardImage}/> )}
                    <div className={styles.cardContent}>
                        <h3 className={styles.sectionTitle}>Informações Gerais</h3>
                        <p className={styles.info}><strong>Localidade:</strong> {caravana.nomeLocalidade || 'N/A'}</p>
                        <p className={styles.info}><strong>Descrição:</strong> {isLoadingDesc ? 'Carregando...' : (descricao || 'Sem descrição')}</p>
                        <p className={styles.info}><strong>Data Viagem:</strong> {formatDate(caravana.data)}</p>
                        <p className={styles.info}><strong>Data Fech. Vendas:</strong> {formatDate(caravana.dataFechamentoVendas)}</p>
                        <p className={styles.info}><strong>Horário Saída:</strong> {caravana.horarioSaida || 'N/A'}</p>
                        <p className={styles.info}><strong>Status:</strong> {translateStatus(caravana.status)}</p>

                        <h3 className={styles.sectionTitle}>Equipe Responsável</h3>
                        <EmployeeInfoDetailed employee={caravana.administrador} role="Administrador" originalUid={caravana.administradorUid} />
                        <EmployeeInfoDetailed employee={caravana.motorista} role="Motorista Principal" originalUid={caravana.motoristaUid} />
                        <EmployeeInfoDetailed employee={caravana.guia} role="Guia" originalUid={caravana.guiaUid} />

                        

                        <h3 className={styles.sectionTitle}>Vagas</h3>
                        <p className={styles.info}><strong>Capacidade {caravana.transporteAlocado ? 'Definida:' : '(Inicial Mínima):'}</strong> {capacidadeReal}</p>
                        <p className={styles.info}><strong>Vagas Disponíveis:</strong> {vagasDisponiveisReais}</p>
                        <p className={styles.info}><strong>Total de Bilhetes Vendidos:</strong> {vagasOcupadas}</p>
                        <p className={styles.info}><strong>Ocupação (vs Capacidade Atual):</strong> {formatPercentage(ocupacaoPercentual)} </p>

                        <h3 className={styles.sectionTitle}>Financeiro</h3>
                        <p className={styles.info}><strong>Preço por Ingresso:</strong> {formatCurrency(caravana.preco)}</p>
                        <p className={styles.info}><strong>Despesas Estimadas:</strong> {formatCurrency(caravana.despesas)}</p>
                        <p className={styles.info}><strong>Arrecadação Atual:</strong> {formatCurrency(caravana.receitaAtual)}</p>
                        <p className={styles.info}><strong>Lucro Atual:</strong> {formatCurrency(caravana.lucroAtual)}</p>
                        <p className={styles.info}><strong>Lucro Máximo Previsto:</strong> {formatCurrency(caravana.lucroMaximo)}</p>
                        <p className={styles.info}><strong>ROI Atual:</strong> {formatRoi(caravana.roiAtual)}</p>
                        <p className={styles.info}><strong>ROI Máximo Previsto:</strong> {formatRoi(caravana.roi)}</p>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default DetalhesCaravanaAdmin;