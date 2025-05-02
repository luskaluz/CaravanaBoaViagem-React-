// ModalDefinirTransporte.js (Completo, sem comentários)
import React, { useState, useEffect, useMemo } from 'react';
import * as api from '../../../services/api';
import styles from './ModalDefinirTransporte.module.css';

const gerarIdTemporario = () => `temp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

function ModalDefinirTransporte({ caravana, onClose, onSave }) {
    const [transportesManuais, setTransportesManuais] = useState([]);
    const [tiposDisponiveis, setTiposDisponiveis] = useState([]);
    const [adminsDisponiveis, setAdminsDisponiveis] = useState([]);
    const [motoristasDisponiveis, setMotoristasDisponiveis] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [loadingResources, setLoadingResources] = useState(true);
    const [dataConfirmacaoPassou, setDataConfirmacaoPassou] = useState(false); // Renomeado para clareza

    // Verifica se a data atual é posterior à data de confirmação
    useEffect(() => {
        if (caravana?.dataConfirmacaoTransporte) {
            const hoje = new Date();
            hoje.setHours(0, 0, 0, 0);
            try {
                const dataConfirmacao = new Date(caravana.dataConfirmacaoTransporte + 'T00:00:00Z');
                setDataConfirmacaoPassou(!isNaN(dataConfirmacao.getTime()) && hoje >= dataConfirmacao);
            } catch(e) {
                 console.error("Erro ao parsear data de confirmação:", e);
                 setDataConfirmacaoPassou(false);
            }
        } else {
            setDataConfirmacaoPassou(false); // Se não tem data, não passou
        }
    }, [caravana?.dataConfirmacaoTransporte]);


    // Carrega recursos e inicializa estado dos transportes
    useEffect(() => {
        let isMounted = true; // Flag para evitar setar estado em componente desmontado
        const fetchResources = async () => {
            setLoadingResources(true);
            setError(null);
            try {
                const [tiposData, funcData] = await Promise.all([
                    api.getTransportes(),
                    api.getFuncionarios()
                ]);

                if (!isMounted) return; // Aborta se componente desmontou

                setTiposDisponiveis(tiposData);
                setAdminsDisponiveis(funcData.filter(f => f.cargo === 'administrador'));
                setMotoristasDisponiveis(funcData.filter(f => f.cargo === 'motorista'));

                // --- LÓGICA DE PREENCHIMENTO INICIAL ATUALIZADA ---
                let transportesIniciais = [];
                const definicaoManualExistente = caravana.transporteDefinidoManualmente && caravana.transportesFinalizados && caravana.transportesFinalizados.length > 0;

                if (definicaoManualExistente) {
                    // 1. Prioridade: Usa a definição manual salva anteriormente
                    transportesIniciais = caravana.transportesFinalizados.map(t => ({
                        ...t,
                        tipoId: t.tipoId || '',
                        nomeTipo: t.nomeTipo || tiposData.find(td => td.id === t.tipoId)?.nome || 'Tipo Desconhecido',
                        assentos: t.assentos || tiposData.find(td => td.id === t.tipoId)?.assentos || 0,
                        administradorUid: t.administradorUid || '',
                        motoristaUid: t.motoristaUid || '',
                        placa: t.placa || '',
                        _instanceId: gerarIdTemporario()
                    }));
                } else if (!dataConfirmacaoPassou && caravana.alocacaoIdealAtual && caravana.alocacaoIdealAtual.length > 0) {
                    // 2. Fallback: Usa a alocação ideal SOMENTE SE NÃO houver manual E a data NÃO passou
                    transportesIniciais = caravana.alocacaoIdealAtual.flatMap(item => {
                        return Array.from({ length: item.quantidade }, () => ({
                             _instanceId: gerarIdTemporario(),
                             tipoId: item.tipoId,
                             nomeTipo: item.nomeTipo,
                             assentos: item.assentos,
                             placa: '',
                             motoristaUid: '',
                             administradorUid: ''
                        }));
                    });
                    console.log("Pré-populando com alocação ideal.");
                }
                // 3. Se não há manual E (data passou OU não há ideal), começa vazio.
                setTransportesManuais(transportesIniciais);
                // --- FIM LÓGICA DE PREENCHIMENTO ---

            } catch (err) {
                console.error("Erro ao carregar recursos para modal:", err);
                 if (isMounted) setError("Falha ao carregar dados necessários.");
            } finally {
                if (isMounted) setLoadingResources(false);
            }
        };
        fetchResources();

        return () => { isMounted = false; }; // Cleanup function

    }, [caravana, dataConfirmacaoPassou]); // Depende da caravana e se a data passou

    const capacidadeManualTotal = useMemo(() => {
        return transportesManuais.reduce((total, veiculo) => {
            return total + (veiculo.assentos || 0);
        }, 0);
    }, [transportesManuais]);

    const capacidadeNecessaria = useMemo(() => {
        const adminsUnicos = new Set(transportesManuais.map(t => t.administradorUid).filter(Boolean));
        const numAdmins = adminsUnicos.size > 0 ? adminsUnicos.size : (transportesManuais.length > 0 ? 1 : 0);
        return (caravana.vagasOcupadas || 0) + numAdmins;
    }, [caravana.vagasOcupadas, transportesManuais]);

    const isCapacidadeSuficiente = useMemo(() => {
        // Se não há veículos e não há clientes, capacidade é suficiente (estado inicial vazio)
        if(transportesManuais.length === 0 && (caravana.vagasOcupadas || 0) === 0) return true;
        return capacidadeManualTotal >= capacidadeNecessaria;
    }, [capacidadeManualTotal, capacidadeNecessaria, transportesManuais.length, caravana.vagasOcupadas]);

    // Funções handleAdicionarVeiculo, handleRemoverVeiculo, handleVeiculoChange
    // NÃO precisam mais da verificação isLocked nelas. O admin pode editar sempre.
    const handleAdicionarVeiculo = (tipoIdSelecionado) => {
        if (!tipoIdSelecionado || loadingResources) return;
        const tipo = tiposDisponiveis.find(t => t.id === tipoIdSelecionado);
        if (!tipo) return;
        setTransportesManuais(prev => [
            ...prev, {
                _instanceId: gerarIdTemporario(), tipoId: tipo.id, nomeTipo: tipo.nome,
                assentos: tipo.assentos, placa: '', motoristaUid: '', administradorUid: ''
            }
        ]);
    };

    const handleRemoverVeiculo = (instanceId) => {
        setTransportesManuais(prev => prev.filter(v => v._instanceId !== instanceId));
    };

    const handleVeiculoChange = (instanceId, field, value) => {
        setTransportesManuais(prev => prev.map(v =>
            v._instanceId === instanceId ? { ...v, [field]: value } : v
        ));
    };


    const handleSalvarDefinicao = async () => {
        // Removida verificação isLocked daqui
        setError(null);

        const vagasClientes = caravana.vagasOcupadas || 0;
        if (transportesManuais.length === 0 && vagasClientes > 0) {
            setError("Adicione pelo menos um veículo para os participantes.");
            return;
        }

        if (!isCapacidadeSuficiente) {
            setError(`Capacidade insuficiente (${capacidadeManualTotal}). Necessário pelo menos ${capacidadeNecessaria} assentos (Clientes + Admins).`);
            return;
        }

        const transportesParaSalvar = transportesManuais.map(({ _instanceId, ...rest }) => ({
             tipoId: rest.tipoId, nomeTipo: rest.nomeTipo, assentos: rest.assentos,
             placa: rest.placa || null, motoristaUid: rest.motoristaUid || null,
             administradorUid: rest.administradorUid || null
        }));

        const dataToSend = { transportesFinalizados: transportesParaSalvar };

        setIsLoading(true);
        try {
            await api.definirTransporteFinal(caravana.id, dataToSend);
            onSave();
        } catch (err) {
            console.error("Erro ao salvar definição de transporte:", err);
            setError(err.message || "Ocorreu um erro desconhecido ao salvar.");
        } finally {
            setIsLoading(false);
        }
    };

    const renderAlocacaoIdeal = () => {
        if (!caravana.alocacaoIdealAtual || caravana.alocacaoIdealAtual.length === 0) {
            return <p>Nenhuma alocação automática calculada ainda.</p>;
        }
        return (
            <ul>
                {caravana.alocacaoIdealAtual.map((item, index) => (
                    <li key={index}>{item.quantidade}x {item.nomeTipo} ({item.assentos} assentos/unid.)</li>
                ))}
                 <li><strong>Capacidade (Ideal Sugerida):</strong> {caravana.capacidadeCalculada || 'N/A'}</li>
            </ul>
        );
    };


    if (loadingResources) {
        return (
            <div className={styles.modalOverlay}><div className={styles.modal}><p>Carregando...</p></div></div>
        );
    }

    return (
        <div className={styles.modalOverlay} onClick={onClose}>
            <div className={`${styles.modal} ${styles.modalLarge}`} onClick={(e) => e.stopPropagation()}>
                <button className={styles.closeButton} onClick={onClose} disabled={isLoading}>×</button>
                <h2>Definir Transporte e Responsáveis - {caravana.nomeLocalidade}</h2>

                {/* O aviso agora é apenas informativo sobre a data */}
                {dataConfirmacaoPassou && (
                    <div className={styles.infoMessage}>
                        A data de confirmação do transporte ({new Date(caravana.dataConfirmacaoTransporte + 'T00:00:00Z').toLocaleDateString('pt-BR', { timeZone: 'UTC' })}) já foi atingida ou passou. A sugestão automática não é mais pré-preenchida, mas edições manuais são permitidas.
                    </div>
                )}
                {error && <div className={styles.error}>{error}</div>}

                <div className={styles.secao}>
                    <h3>Alocação Ideal Calculada (Sugestão)</h3>
                    {renderAlocacaoIdeal()}
                    <p><strong>Pessoas a Alocar:</strong> {capacidadeNecessaria} ({caravana.vagasOcupadas || 0} Clientes + {Math.max(0, capacidadeNecessaria - (caravana.vagasOcupadas || 0))} Admin(s))</p>
                </div>

                <hr className={styles.separator} />

                <div className={styles.secao}>
                    <h3>Definição Manual de Veículos</h3>
                    <h4>Veículos Atuais:</h4>
                    {transportesManuais.length === 0 && <p>Nenhum veículo adicionado.</p>}
                    <ul className={styles.listaVeiculos}>
                        {transportesManuais.map((veiculo) => (
                            <li key={veiculo._instanceId} className={styles.veiculoItem}>
                                <div className={styles.veiculoInfo}>
                                    <strong>{veiculo.nomeTipo} ({veiculo.assentos} assentos)</strong>
                                    <div className={styles.veiculoInputs}>
                                        {/* Inputs NÃO estão mais desabilitados por isLocked */}
                                        <input
                                            type="text" placeholder="Placa (Opcional)"
                                            value={veiculo.placa || ''}
                                            onChange={(e) => handleVeiculoChange(veiculo._instanceId, 'placa', e.target.value)}
                                            className={styles.textInput} disabled={isLoading}
                                        />
                                        <select
                                            value={veiculo.motoristaUid || ''}
                                            onChange={(e) => handleVeiculoChange(veiculo._instanceId, 'motoristaUid', e.target.value)}
                                            className={styles.selectInput} disabled={isLoading}
                                        >
                                            <option value="">-- Motorista (Opcional) --</option>
                                            {motoristasDisponiveis.map(mot => ( <option key={mot.uid || mot.id} value={mot.uid || mot.id}>{mot.nome}</option> ))}
                                        </select>
                                        <select
                                            value={veiculo.administradorUid || ''}
                                            onChange={(e) => handleVeiculoChange(veiculo._instanceId, 'administradorUid', e.target.value)}
                                            className={styles.selectInput} disabled={isLoading}
                                        >
                                            <option value="">-- Admin do Veículo --</option>
                                            {adminsDisponiveis.map(admin => ( <option key={admin.uid || admin.id} value={admin.uid || admin.id}>{admin.nome}</option> ))}
                                        </select>
                                    </div>
                                </div>
                                {/* Botão Remover NÃO está mais desabilitado por isLocked */}
                                <button onClick={() => handleRemoverVeiculo(veiculo._instanceId)} className={styles.removeButton} disabled={isLoading}> Remover </button>
                            </li>
                        ))}
                    </ul>

                    <div className={styles.formGroup}>
                        <label htmlFor="addTipo">Adicionar Veículo:</label>
                        {/* Select NÃO está mais desabilitado por isLocked */}
                        <select
                            id="addTipo"
                            onChange={(e) => { handleAdicionarVeiculo(e.target.value); e.target.value = ""; }}
                            value="" className={styles.selectInput}
                            disabled={isLoading || loadingResources}
                        >
                            <option value="" disabled>-- Selecione um Tipo --</option>
                            {tiposDisponiveis.map(tipo => ( <option key={tipo.id} value={tipo.id}>{tipo.nome} ({tipo.assentos} assentos)</option> ))}
                        </select>
                    </div>

                    <p><strong>Capacidade Total Manual:</strong> {capacidadeManualTotal} assentos</p>
                    {!isCapacidadeSuficiente && capacidadeManualTotal > 0 && (
                        <p className={styles.warning}>A capacidade manual ({capacidadeManualTotal}) é INSUFICIENTE para as {capacidadeNecessaria} pessoas necessárias (Clientes + Admins).</p>
                    )}
                </div>

                <div className={styles.buttonGroup}>
                     {/* Botão Salvar NÃO está mais desabilitado por isLocked */}
                    <button
                        onClick={handleSalvarDefinicao} className={styles.saveButton}
                        disabled={isLoading || !isCapacidadeSuficiente || (transportesManuais.length === 0 && (caravana.vagasOcupadas || 0) > 0)}
                    >
                        {isLoading ? 'Salvando...' : 'Salvar Definição'}
                    </button>
                    <button onClick={onClose} className={styles.cancelButton} disabled={isLoading}> Cancelar </button>
                </div>
            </div>
        </div>
    );
}

export default ModalDefinirTransporte;