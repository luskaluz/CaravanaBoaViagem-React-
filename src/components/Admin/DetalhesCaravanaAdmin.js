import React, { useState, useEffect } from 'react';
import styles from './DetalhesCaravanaAdmin.module.css';
import * as api from '../../services/api';
// Importe o modal de alocação manual que você criará
import AlocacaoManualModal from './modal/AlocacaoManualModal';

const PLACEHOLDER_IMAGE_URL = "https://via.placeholder.com/80x120?text=Foto";

function DetalhesCaravanaAdmin({ caravana, onClose, onCaravanaUpdate }) { // Adicionado onCaravanaUpdate
    const [descricao, setDescricao] = useState('');
    const [isLoadingDesc, setIsLoadingDesc] = useState(false);
    // Estado para controlar o modal de alocação manual
    const [showAlocacaoModal, setShowAlocacaoModal] = useState(false);

    const formatDate = (dateString) => {
        if (!dateString) return 'N/A';
        try { return new Date(dateString + 'T00:00:00').toLocaleDateString('pt-BR'); }
        catch (e) { return 'Data Inválida'; }
    };

    useEffect(() => {
        const fetchDescricao = async () => {
            if (caravana && caravana.localidadeId) {
                setIsLoadingDesc(true);
                try {
                    const localidadeData = await api.getDescricaoLocalidade(caravana.localidadeId);
                    setDescricao(localidadeData.descricao || '');
                } catch (error) { console.error(error); setDescricao('Erro.'); }
                finally { setIsLoadingDesc(false); }
            } else { setDescricao('N/A'); }
        };
        fetchDescricao();
    }, [caravana]);

    const translateStatus = (status) => {
        switch (status) {
            case 'confirmada': return 'Confirmada';
            case 'nao_confirmada': return 'Não Confirmada';
            case 'cancelada': return 'Cancelada';
            case 'concluida': return 'Concluída';
            case 'erro_alocacao_transporte': return 'Erro Alocação'; // Exemplo de status de erro
            default: return 'Desconhecido';
        }
    };

    const EmployeeInfoDetailed = ({ employee, role, originalUid }) => {
        if (!employee) {
            return ( <div className={`${styles.employeeBlock} ${styles.employeeNotConfirmed}`}><div className={styles.employeeDetails}><p className={styles.infoStrong}><strong>{role}:</strong> Não Confirmado</p></div></div> );
        }
        if (employee.error) {
             return ( <div className={styles.employeeBlock}><img src={PLACEHOLDER_IMAGE_URL} alt={role} className={styles.employeePhoto}/><div className={styles.employeeDetails}><p className={styles.infoStrong}><strong>{role}:</strong> Erro</p><p className={styles.infoSmall}>UID: {originalUid || 'N/A'}</p></div></div> );
        }
        return (
            <div className={styles.employeeBlock}>
                <img src={employee.fotoUrl || PLACEHOLDER_IMAGE_URL} alt={employee.nome || role} className={styles.employeePhoto} onError={(e) => { e.target.onerror = null; e.target.src=PLACEHOLDER_IMAGE_URL }}/>
                <div className={styles.employeeDetails}>
                    <p className={styles.infoStrong}><strong>{role}:</strong> {employee.nome || 'N/A'}</p>
                    <p className={styles.infoSmall}><strong>Email:</strong> {employee.email || 'N/A'}</p>
                    <p className={styles.infoSmall}><strong>Telefone:</strong> {employee.telefone || 'N/A'}</p>
                </div>
            </div>
        );
    };

     // Funções para o modal de alocação
     const openAlocacaoModal = () => setShowAlocacaoModal(true);
     const closeAlocacaoModal = () => setShowAlocacaoModal(false);
     const handleAlocacaoSalva = () => {
         closeAlocacaoModal();
         if (onCaravanaUpdate) {
             onCaravanaUpdate(); // Chama a função do pai para recarregar a lista/dados
         }
         alert("Alocação manual salva! Os dados podem levar um momento para atualizar.");
     };


    if (!caravana) return null;

    const formatCurrency = (value) => `R$ ${(parseFloat(value) || 0).toFixed(2)}`;
    const formatPercentage = (value) => `${(parseFloat(value) || 0).toFixed(1)}%`;
    const formatRoi = (value) => (value === Infinity ? 'N/A' : formatPercentage(value));

    const vagasOcupadas = caravana.vagasOcupadas || 0;
    const ocupacaoPercentual = caravana.ocupacaoPercentual ?? (caravana.vagasTotais > 0 ? (vagasOcupadas / caravana.vagasTotais) * 100 : 0);

    // Determina a capacidade real (total inicial ou alocada)
    const capacidadeReal = caravana.transporteConfirmado && caravana.transportesAlocados?.length > 0
                           ? caravana.transportesAlocados.reduce((sum, t) => sum + (t.assentos || 0), 0)
                           : caravana.vagasTotais || 0;
    const vagasDisponiveisReais = Math.max(0, capacidadeReal - (vagasOcupadas + (caravana.administradorUid ? 1 : 0))); // Calcula disponíveis reais


    return (
        <div className={styles.container}>
            <div className={styles.modalContent}>
                <h2 className={styles.title}>Detalhes da Caravana</h2>
                <div className={styles.card}>
                     {caravana.imagensLocalidade && caravana.imagensLocalidade.length > 0 && ( <img src={caravana.imagensLocalidade[0]} alt={caravana.nomeLocalidade || 'Localidade'} className={styles.cardImage}/> )}
                    <div className={styles.cardContent}>
                        <h3 className={styles.sectionTitle}>Informações Gerais</h3>
                        <p className={styles.info}><strong>Localidade:</strong> {caravana.nomeLocalidade || 'N/A'}</p>
                        <p className={styles.info}><strong>Descrição:</strong> {isLoadingDesc ? 'Carregando...' : (descricao || 'Sem descrição')}</p>
                        <p className={styles.info}><strong>Data Viagem:</strong> {formatDate(caravana.data)}</p>
                        <p className={styles.info}><strong>Data Fech. Vendas:</strong> {formatDate(caravana.dataFechamentoVendas)}</p>
                        <p className={styles.info}><strong>Data Conf. Transporte:</strong> {formatDate(caravana.dataConfirmacaoTransporte)}</p>
                        <p className={styles.info}><strong>Horário Saída:</strong> {caravana.horarioSaida || 'N/A'}</p>
                        <p className={styles.info}><strong>Status:</strong> {translateStatus(caravana.status)}</p>

                        <h3 className={styles.sectionTitle}>Equipe Responsável</h3>
                        <EmployeeInfoDetailed employee={caravana.administrador} role="Administrador" originalUid={caravana.administradorUid} />
                        <EmployeeInfoDetailed employee={caravana.motorista} role="Motorista" originalUid={caravana.motoristaUid} />
                        <EmployeeInfoDetailed employee={caravana.guia} role="Guia" originalUid={caravana.guiaUid} />

                        <h3 className={styles.sectionTitle}>Transporte</h3>
                        <p className={styles.info}><strong>Status Transporte:</strong> {caravana.transporteConfirmado ? 'Confirmado/Alocado' : 'Aguardando Confirmação'}</p>
                        {/* Exibe lista de transportes alocados */}
                        {caravana.transporteConfirmado && caravana.transportesAlocados && caravana.transportesAlocados.length > 0 && (
                            <>
                                <p className={styles.info}><strong>Veículos Alocados:</strong></p>
                                <ul className={styles.listaTransportes}>
                                    {caravana.transportesAlocados.map((transporte, index) => (
                                        <li key={transporte.id || index}>
                                            {transporte.nome || 'Veículo'} (Placa: {transporte.placa || 'N/A'}, Assentos: {transporte.assentos || '?'})
                                            {/* Aqui você poderia adicionar a exibição do motorista alocado para este veículo, se implementado */}
                                            {/* {transporte.motoristaUid && <span> - Motorista: {NOME_DO_MOTORISTA}</span>} */}
                                        </li>
                                    ))}
                                </ul>
                            </>
                         )}
                         {caravana.transporteConfirmado && (!caravana.transportesAlocados || caravana.transportesAlocados.length === 0) && (
                            <p className={styles.info}>Nenhum veículo foi necessário ou alocado.</p>
                         )}
                         {/* <<< BOTÃO DE ALOCAÇÃO MANUAL >>> */}
                         {/* Mostra o botão se a caravana não estiver cancelada */}
                         {caravana.status !== 'cancelada' && (
                            <button onClick={openAlocacaoModal} className={styles.botaoAlocarManual}>
                                {caravana.transporteConfirmado ? 'Alterar Alocação Manual' : 'Alocar Manualmente'}
                            </button>
                         )}


                        <h3 className={styles.sectionTitle}>Vagas</h3>
                        <p className={styles.info}><strong>Vagas Totais (Inicial):</strong> {caravana.vagasTotais || 0}</p>
                         {/* Mostra capacidade real após alocação */}
                         {caravana.transporteConfirmado && <p className={styles.info}><strong>Capacidade Real (Alocada):</strong> {capacidadeReal}</p>}
                        <p className={styles.info}><strong>Vagas Disponíveis (Real):</strong> {vagasDisponiveisReais}</p>
                        <p className={styles.info}><strong>Total de Bilhetes Vendidos:</strong> {vagasOcupadas}</p>
                        <p className={styles.info}><strong>Ocupação (Baseado no Total Inicial):</strong> {formatPercentage(ocupacaoPercentual)} </p>
                         {/* Opcional: Calcular ocupação baseada na capacidade real */}
                         {caravana.transporteConfirmado && capacidadeReal > 0 && <p className={styles.info}><strong>Ocupação (Baseado na Cap. Real):</strong> {formatPercentage((vagasOcupadas / capacidadeReal) * 100)} </p>}

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

             {/* Renderiza o Modal de Alocação Manual */}
             {showAlocacaoModal && (
                <AlocacaoManualModal
                    caravana={caravana}
                    onClose={closeAlocacaoModal}
                    onAlocacaoSalva={handleAlocacaoSalva}
                />
            )}
        </div>
    );
}

export default DetalhesCaravanaAdmin;