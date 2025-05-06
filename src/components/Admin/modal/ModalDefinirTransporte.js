// ModalDefinirTransporte.js (Completo, com Validação de Motorista)
import React, { useState, useEffect, useMemo } from 'react';
import * as api from '../../../services/api';
import styles from './ModalDefinirTransporte.module.css';
import LoadingSpinner from '../../LoadingSpinner/LoadingSpinner'; // Importa se for usar aqui dentro

const gerarIdTemporario = () => `temp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

function ModalDefinirTransporte({ caravana, onClose, onSave }) {
    const [transportesManuais, setTransportesManuais] = useState([]);
    const [tiposDisponiveis, setTiposDisponiveis] = useState([]);
    const [adminsDisponiveis, setAdminsDisponiveis] = useState([]);
    const [motoristasDisponiveis, setMotoristasDisponiveis] = useState([]);
    const [isLoading, setIsLoading] = useState(false); // Loading para salvar
    const [error, setError] = useState(null);
    const [loadingResources, setLoadingResources] = useState(true); // Loading para dados iniciais
    const [dataConfirmacaoPassou, setDataConfirmacaoPassou] = useState(false);

    useEffect(() => {
        if (caravana?.dataConfirmacaoTransporte) {
            const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
            try {
                const dataConfirmacao = new Date(caravana.dataConfirmacaoTransporte + 'T00:00:00Z');
                setDataConfirmacaoPassou(!isNaN(dataConfirmacao.getTime()) && hoje >= dataConfirmacao);
            } catch(e) { setDataConfirmacaoPassou(false); }
        } else { setDataConfirmacaoPassou(false); }
    }, [caravana?.dataConfirmacaoTransporte]);


    useEffect(() => {
        let isMounted = true;
        const fetchResources = async () => {
            setLoadingResources(true); setError(null);
            try {
                const [tiposData, funcData] = await Promise.all([ api.getTransportes(), api.getFuncionarios() ]);
                if (!isMounted) return;
                setTiposDisponiveis(tiposData);
                setAdminsDisponiveis(funcData.filter(f => f.cargo === 'administrador'));
                setMotoristasDisponiveis(funcData.filter(f => f.cargo === 'motorista'));

                let transportesIniciais = [];
                const definicaoManualExistente = caravana.transporteDefinidoManualmente && caravana.transportesFinalizados && caravana.transportesFinalizados.length > 0;

                if (definicaoManualExistente) {
                    transportesIniciais = caravana.transportesFinalizados.map(t => ({ ...t, tipoId: t.tipoId || '', nomeTipo: t.nomeTipo || tiposData.find(td => td.id === t.tipoId)?.nome || 'Desconhecido', assentos: t.assentos || tiposData.find(td => td.id === t.tipoId)?.assentos || 0, administradorUid: t.administradorUid || '', motoristaUid: t.motoristaUid || '', placa: t.placa || '', _instanceId: gerarIdTemporario() }));
                } else if (!dataConfirmacaoPassou && caravana.alocacaoIdealAtual && caravana.alocacaoIdealAtual.length > 0) {
                    transportesIniciais = caravana.alocacaoIdealAtual.flatMap(item => Array.from({ length: item.quantidade }, () => ({ _instanceId: gerarIdTemporario(), tipoId: item.tipoId, nomeTipo: item.nomeTipo, assentos: item.assentos, placa: '', motoristaUid: '', administradorUid: '' })));
                    console.log("Pré-populando com alocação ideal.");
                }
                setTransportesManuais(transportesIniciais);
            } catch (err) {
                console.error("Erro ao carregar recursos para modal:", err);
                 if (isMounted) setError("Falha ao carregar dados necessários.");
            } finally {
                if (isMounted) setLoadingResources(false);
            }
        };
        fetchResources();
        return () => { isMounted = false; };
    }, [caravana, dataConfirmacaoPassou]);

    // --- LÓGICA PARA IDENTIFICAR MOTORISTAS JÁ USADOS ---
    const motoristasUsados = useMemo(() => {
        const uids = new Set();
        transportesManuais.forEach(v => {
            if (v.motoristaUid) {
                uids.add(v.motoristaUid);
            }
        });
        return uids;
    }, [transportesManuais]);
    // --- FIM LÓGICA ---

    const capacidadeManualTotal = useMemo(() => transportesManuais.reduce((total, veiculo) => total + (veiculo.assentos || 0), 0), [transportesManuais]);

    const capacidadeNecessaria = useMemo(() => {
        const numAdmins = transportesManuais.length; // 1 admin por veículo
        return (caravana.vagasOcupadas || 0) + numAdmins;
    }, [caravana.vagasOcupadas, transportesManuais]);

    const isCapacidadeSuficiente = useMemo(() => {
        if(transportesManuais.length === 0 && (caravana.vagasOcupadas || 0) === 0) return true;
        return capacidadeManualTotal >= capacidadeNecessaria;
    }, [capacidadeManualTotal, capacidadeNecessaria, transportesManuais.length, caravana.vagasOcupadas]);

    const handleAdicionarVeiculo = (tipoIdSelecionado) => {
        if (!tipoIdSelecionado || dataConfirmacaoPassou || loadingResources) return;
        const tipo = tiposDisponiveis.find(t => t.id === tipoIdSelecionado);
        if (!tipo) return;
        setTransportesManuais(prev => [ ...prev, { _instanceId: gerarIdTemporario(), tipoId: tipo.id, nomeTipo: tipo.nome, assentos: tipo.assentos, placa: '', motoristaUid: '', administradorUid: '' } ]);
    };

    const handleRemoverVeiculo = (instanceId) => {
        if (dataConfirmacaoPassou) return; // Mantém bloqueio pós-data aqui
        setTransportesManuais(prev => prev.filter(v => v._instanceId !== instanceId));
    };

    const handleVeiculoChange = (instanceId, field, value) => {
        if (dataConfirmacaoPassou) return; // Mantém bloqueio pós-data aqui
        setTransportesManuais(prev => prev.map(v => v._instanceId === instanceId ? { ...v, [field]: value } : v ));
    };

    const handleSalvarDefinicao = async () => {
        if (dataConfirmacaoPassou) { setError("Edição bloqueada após data de confirmação."); return; }
        setError(null);
        const vagasClientes = caravana.vagasOcupadas || 0;
        if (transportesManuais.length === 0 && vagasClientes > 0) { setError("Adicione veículo(s) para os participantes."); return; }
        if (!isCapacidadeSuficiente) { setError(`Capacidade insuficiente (${capacidadeManualTotal}). Necessário ${capacidadeNecessaria} assentos (Clientes + Admins).`); return; }

        // Verifica se algum motorista foi usado mais de uma vez
        const motoristasSelecionados = transportesManuais.map(v => v.motoristaUid).filter(Boolean); // Pega só os UIDs preenchidos
        const motoristasDuplicados = motoristasSelecionados.filter((item, index) => motoristasSelecionados.indexOf(item) !== index);
        if (motoristasDuplicados.length > 0) {
            const nomesDuplicados = [...new Set(motoristasDuplicados)].map(uid => motoristasDisponiveis.find(m => (m.uid || m.id) === uid)?.nome || uid).join(', ');
            setError(`O(s) seguinte(s) motorista(s) foi(ram) selecionado(s) para mais de um veículo: ${nomesDuplicados}. Cada motorista só pode ser alocado a um veículo por caravana.`);
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
        } catch (err) { setError(err.message || "Erro ao salvar."); }
        finally { setIsLoading(false); }
    };

    const renderAlocacaoIdeal = () => {
        if (!caravana.alocacaoIdealAtual || caravana.alocacaoIdealAtual.length === 0) return <p>Nenhuma sugestão automática.</p>;
        return ( <ul> {caravana.alocacaoIdealAtual.map((item, index) => ( <li key={index}>{item.quantidade}x {item.nomeTipo} ({item.assentos}a)</li> ))} <li><strong>Capacidade maxima:</strong> {caravana.capacidadeCalculada || 'N/A'}</li> </ul> );
    };

    if (loadingResources) {
        return ( <div className={styles.modalOverlay}><div className={styles.modal}><LoadingSpinner mensagem="Carregando dados..." /></div></div> );
    }

    return (
        <div className={styles.modalOverlay} onClick={onClose}>
            <div className={`${styles.modal} ${styles.modalLarge}`} onClick={(e) => e.stopPropagation()}>
                <button className={styles.closeButton} onClick={onClose} disabled={isLoading}>×</button>
                <h2>Definir Transporte - {caravana.nomeLocalidade}</h2>

                {dataConfirmacaoPassou && ( <div className={styles.infoMessage}> Data de confirmação atingida. Alterações manuais ainda permitidas, mas a sugestão não é mais pré-preenchida. </div> )}
                {error && <div className={styles.error}>{error}</div>}

                <div className={styles.secao}>
                    <h3>Alocação Sugerida</h3>
                    {renderAlocacaoIdeal()}
                    <p><strong>Pessoas a Alocar:</strong> {capacidadeNecessaria} ({caravana.vagasOcupadas || 0} Clientes + {Math.max(0, capacidadeNecessaria - (caravana.vagasOcupadas || 0))} Admin(s))</p>
                </div>
                <hr className={styles.separator} />
                <div className={styles.secao}>
                    <h3>Definição Manual</h3>
                    <h4>Veículos Atuais:</h4>
                    {transportesManuais.length === 0 && <p>Nenhum veículo adicionado.</p>}
                    <ul className={styles.listaVeiculos}>
                        {transportesManuais.map((veiculo) => (
                            <li key={veiculo._instanceId} className={styles.veiculoItem}>
                                <div className={styles.veiculoInfo}>
                                    <strong>{veiculo.nomeTipo} ({veiculo.assentos} assentos)</strong>
                                    <div className={styles.veiculoInputs}>
                                        <input type="text" placeholder="Placa (Opcional)" value={veiculo.placa || ''} onChange={(e) => handleVeiculoChange(veiculo._instanceId, 'placa', e.target.value)} className={styles.textInput} disabled={isLoading || dataConfirmacaoPassou} />
                                        <select value={veiculo.motoristaUid || ''} onChange={(e) => handleVeiculoChange(veiculo._instanceId, 'motoristaUid', e.target.value)} className={styles.selectInput} disabled={isLoading || dataConfirmacaoPassou}>
                                            <option value="">-- Motorista --</option>
                                            {motoristasDisponiveis.map(mot => (
                                                 // Desabilita motorista se já estiver usado em OUTRO veículo
                                                <option key={mot.uid || mot.id} value={mot.uid || mot.id} disabled={motoristasUsados.has(mot.uid || mot.id) && veiculo.motoristaUid !== (mot.uid || mot.id)}>
                                                    {mot.nome} {motoristasUsados.has(mot.uid || mot.id) && veiculo.motoristaUid !== (mot.uid || mot.id) ? '(Já alocado)' : ''}
                                                </option>
                                            ))}
                                        </select>
                                        <select value={veiculo.administradorUid || ''} onChange={(e) => handleVeiculoChange(veiculo._instanceId, 'administradorUid', e.target.value)} className={styles.selectInput} disabled={isLoading || dataConfirmacaoPassou}>
                                            <option value="">-- Admin Veículo --</option>
                                            {adminsDisponiveis.map(admin => ( <option key={admin.uid || admin.id} value={admin.uid || admin.id}>{admin.nome}</option> ))}
                                        </select>
                                    </div>
                                </div>
                                <button onClick={() => handleRemoverVeiculo(veiculo._instanceId)} className={styles.removeButton} disabled={isLoading || dataConfirmacaoPassou}> Remover </button>
                            </li>
                        ))}
                    </ul>
                    <div className={styles.formGroup}>
                        <label htmlFor="addTipo">Adicionar Veículo:</label>
                        <select id="addTipo" onChange={(e) => { handleAdicionarVeiculo(e.target.value); e.target.value = ""; }} value="" className={styles.selectInput} disabled={isLoading || dataConfirmacaoPassou || loadingResources} >
                            <option value="" disabled>-- Selecione um Tipo --</option>
                            {tiposDisponiveis.map(tipo => ( <option key={tipo.id} value={tipo.id}>{tipo.nome} ({tipo.assentos} assentos)</option> ))}
                        </select>
                    </div>
                    <p><strong>Capacidade Total Manual:</strong> {capacidadeManualTotal} assentos</p>
                    {!isCapacidadeSuficiente && capacidadeManualTotal > 0 && ( <p className={styles.warning}>Capacidade ({capacidadeManualTotal}) INSUFICIENTE para {capacidadeNecessaria} pessoas.</p> )}
                </div>
                <div className={styles.buttonGroup}>
                    <button onClick={handleSalvarDefinicao} className={styles.saveButton} disabled={isLoading || dataConfirmacaoPassou || !isCapacidadeSuficiente || (transportesManuais.length === 0 && (caravana.vagasOcupadas || 0) > 0)}>
                        {isLoading ? 'Salvando...' : 'Salvar Definição'}
                    </button>
                    <button onClick={onClose} className={styles.cancelButton} disabled={isLoading}> Cancelar </button>
                </div>
            </div>
        </div>
    );
}

export default ModalDefinirTransporte;  