import React, { useState, useEffect, useMemo } from 'react';
import * as api from '../../../services/api';
import styles from './FormularioCaravana.module.css';

function FormularioCaravana({ caravana, preSelectedLocalidadeId, onSalvar, onCancelar }) {
    const [localidadeId, setLocalidadeId] = useState(preSelectedLocalidadeId || '');
    const [dataViagem, setDataViagem] = useState('');
    const [horarioSaida, setHorarioSaida] = useState('');
    const [despesas, setDespesas] = useState('');
    const [lucroAbsoluto, setLucroAbsoluto] = useState('');
    const [ocupacaoMinima, setOcupacaoMinima] = useState('');
    const [precoManual, setPrecoManual] = useState('');
    const [maximoTransportes, setMaximoTransportes] = useState('');
    const [dataConfirmacaoTransporte, setDataConfirmacaoTransporte] = useState('');
    const [dataFechamentoVendas, setDataFechamentoVendas] = useState('');
    const [localidades, setLocalidades] = useState([]);
    const [funcionarios, setFuncionarios] = useState([]); // Estado único para funcionários
    const [guias, setGuias] = useState([]);
    const [selectedGuiaUid, setSelectedGuiaUid] = useState('');
    const [isEditMode, setIsEditMode] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [loadingResources, setLoadingResources] = useState(true);

    const formatDateForInput = (dateString) => {
        if (!dateString) return '';
        try { return new Date(dateString).toISOString().split('T')[0]; }
        catch (e) { console.warn("Data inválida:", dateString); return ''; }
    };

    useEffect(() => {
        const fetchResources = async () => {
            setLoadingResources(true); setError(null);
            try {
                const [locData, funcData] = await Promise.all([
                    api.getLocalidades(),
                    api.getFuncionarios()
                ]);
                setLocalidades(locData);
                setFuncionarios(funcData); // Guarda todos os funcionários
                setGuias(funcData.filter(f => f.cargo === 'guia')); // Filtra guias para o select
            } catch (err) { console.error(err); setError("Falha ao carregar recursos."); }
            finally { setLoadingResources(false); }
        };
        fetchResources();
    }, []);

    useEffect(() => {
        setError(null);
        if (caravana) {
            setIsEditMode(true);
            setLocalidadeId(caravana.localidadeId || '');
            setDataViagem(formatDateForInput(caravana.data));
            setHorarioSaida(caravana.horarioSaida || '');
            setDespesas(String(caravana.despesas || ''));
            setLucroAbsoluto(String(caravana.lucroAbsoluto || ''));
            setOcupacaoMinima(String(caravana.ocupacaoMinima || ''));
            setPrecoManual(caravana.preco !== undefined ? String(caravana.preco) : '');
            setMaximoTransportes(String(caravana.maximoTransportes || ''));
            setSelectedGuiaUid(caravana.guiaUid || ''); // Só seta o guia
            setDataConfirmacaoTransporte(formatDateForInput(caravana.dataConfirmacaoTransporte));
            setDataFechamentoVendas(formatDateForInput(caravana.dataFechamentoVendas));
        } else {
            setIsEditMode(false);
            setLocalidadeId(preSelectedLocalidadeId || '');
            setDataViagem(''); setHorarioSaida('');
            setDespesas(''); setLucroAbsoluto(''); setOcupacaoMinima('');
            setPrecoManual(''); setMaximoTransportes('');
            setSelectedGuiaUid(''); // Só reseta o guia
            setDataConfirmacaoTransporte(''); setDataFechamentoVendas('');
        }
    }, [caravana, preSelectedLocalidadeId]);

    const precoEstimado = useMemo(() => {
        const despesasNum = parseFloat(despesas);
        const lucroNum = parseFloat(lucroAbsoluto);
        const ocupacaoNum = parseInt(ocupacaoMinima, 10);
        if (!isNaN(despesasNum) && !isNaN(lucroNum) && !isNaN(ocupacaoNum) && ocupacaoNum > 0) {
            return (despesasNum + lucroNum) / ocupacaoNum;
        }
        return 0;
    }, [despesas, lucroAbsoluto, ocupacaoMinima]);

    const handleSubmit = async (event) => {
        event.preventDefault(); setError(null);

        if (!localidadeId || !dataViagem || !despesas || !lucroAbsoluto || !ocupacaoMinima || precoManual === '' || !maximoTransportes || !dataConfirmacaoTransporte) {
             setError("Preencha Localidade, Datas (Viagem, Conf. Transporte), Cálculos, Preço e Nº Máx. Transportes."); return;
        }

        const precoNum = parseFloat(precoManual);
        if (isNaN(precoNum) || precoNum < 0) { setError("Preço Final inválido."); return; }

        const maxTranspNum = parseInt(maximoTransportes, 10);
        if (isNaN(maxTranspNum) || maxTranspNum <= 0) { setError("Número Máximo de Transportes inválido."); return; }

        const ocupacaoMinNum = parseInt(ocupacaoMinima, 10);
        if (isNaN(ocupacaoMinNum) || ocupacaoMinNum <= 0) { setError("Ocupação Mínima inválida."); return; }

        const dtViagem = new Date(dataViagem + 'T00:00:00');
        const dtConfTransp = dataConfirmacaoTransporte ? new Date(dataConfirmacaoTransporte + 'T00:00:00') : null;
        const dtFechVendas = dataFechamentoVendas ? new Date(dataFechamentoVendas + 'T00:00:00') : null;

        if (dtConfTransp && dtFechVendas && dtConfTransp > dtFechVendas) { setError("Data Conf. Transporte não pode ser posterior à Data de Fechamento."); return; }
        if (dtFechVendas && dtViagem && dtFechVendas > dtViagem) { setError("Data Fechamento não pode ser posterior à Data da Viagem."); return; }
        if (dtConfTransp && dtViagem && dtConfTransp > dtViagem) { setError("Data Conf. Transporte não pode ser posterior à Data da Viagem."); return; }

        setIsLoading(true);
        const caravanaData = {
            localidadeId, data: dataViagem, horarioSaida: horarioSaida || null,
            despesas: parseFloat(despesas) || 0, lucroAbsoluto: parseFloat(lucroAbsoluto) || 0,
            ocupacaoMinima: ocupacaoMinNum,
            preco: precoNum,
            maximoTransportes: maxTranspNum,
            guiaUid: (selectedGuiaUid === "nao_confirmado" || selectedGuiaUid === "") ? null : selectedGuiaUid, // Só envia o guia
            dataConfirmacaoTransporte: dataConfirmacaoTransporte,
            dataFechamentoVendas: dataFechamentoVendas || null,
            // administradorUid e motoristaUid não são enviados daqui
        };

        try {
            if (isEditMode) { await api.updateCaravana(caravana.id, caravanaData); }
            else { await api.createCaravana(caravanaData); }
            onSalvar();
        } catch (err) { console.error(err); setError(err.message || "Ocorreu um erro desconhecido."); }
        finally { setIsLoading(false); }
    };

    if (loadingResources) return <div className={styles.loading}>Carregando dados...</div>;

    return (
        <div className={styles.container}>
            <h2 className={styles.title}>{isEditMode ? "Editar Caravana" : "Criar Caravana"}</h2>
            {error && <div className={styles.error}>{error}</div>}
            <form onSubmit={handleSubmit} className={styles.form}>
                 <div className={styles.formGroup}>
                    <label htmlFor="localidadeId" className={styles.label}>Localidade:</label>
                    <select id="localidadeId" value={localidadeId} onChange={(e) => setLocalidadeId(e.target.value)} required className={styles.input} disabled={!!preSelectedLocalidadeId && !isEditMode}>
                        <option value="">Selecione...</option>
                        {localidades.map(loc => ( <option key={loc.id} value={loc.id}>{loc.nome}</option> ))}
                    </select>
                 </div>
                 <div className={styles.formGroup}>
                    <label htmlFor="dataViagem" className={styles.label}>Data da Viagem:</label>
                    <input type="date" id="dataViagem" value={dataViagem} onChange={(e) => setDataViagem(e.target.value)} required className={styles.input}/>
                 </div>
                 <div className={styles.formGroup}>
                    <label htmlFor="dataFechamentoVendas" className={styles.label}>Data Limite Venda Ingressos:</label>
                    <input type="date" id="dataFechamentoVendas" value={dataFechamentoVendas} onChange={(e) => setDataFechamentoVendas(e.target.value)} className={styles.input}/>
                 </div>
                 <div className={styles.formGroup}>
                    <label htmlFor="dataConfirmacaoTransporte" className={styles.label}>Data Definição Transporte:</label>
                    <input type="date" id="dataConfirmacaoTransporte" value={dataConfirmacaoTransporte} onChange={(e) => setDataConfirmacaoTransporte(e.target.value)} required className={styles.input}/>
                 </div>
                 <div className={styles.formGroup}>
                    <label htmlFor="horarioSaida" className={styles.label}>Horário Saída:</label>
                    <input type="time" id="horarioSaida" value={horarioSaida} onChange={(e) => setHorarioSaida(e.target.value)} className={styles.input}/>
                 </div>

                 <div className={styles.formRow}>
                    <div className={styles.formGroup}>
                        <label htmlFor="ocupacaoMinima" className={styles.label}>Ocupação Mínima:</label>
                        <input type="number" id="ocupacaoMinima" value={ocupacaoMinima} onChange={(e) => setOcupacaoMinima(e.target.value)} required min="1" className={styles.input}/>
                    </div>
                    <div className={styles.formGroup}>
                        <label htmlFor="maximoTransportes" className={styles.label}>Nº Máx. Transportes:</label>
                        <input
                            type="number"
                            id="maximoTransportes"
                            value={maximoTransportes}
                            onChange={(e) => setMaximoTransportes(e.target.value)}
                            required
                            min="1"
                            className={styles.input}
                        />
                    </div>
                 </div>

                 <div className={styles.formRow}>
                    <div className={styles.formGroup}>
                         <label htmlFor="despesas" className={styles.label}>Despesas Estimadas (R$):</label>
                         <input type="number" id="despesas" value={despesas} onChange={(e) => setDespesas(e.target.value)} required min="0" step="0.01" className={styles.input}/>
                     </div>
                     <div className={styles.formGroup}>
                         <label htmlFor="lucroAbsoluto" className={styles.label}>Lucro Desejado (R$):</label>
                         <input type="number" id="lucroAbsoluto" value={lucroAbsoluto} onChange={(e) => setLucroAbsoluto(e.target.value)} required min="0" step="0.01" className={styles.input}/>
                     </div>
                 </div>
                 <div className={styles.formGroup}>
                     <label className={styles.label}>Preço Estimado (Baseado no Mínimo):</label>
                     <input type="text" value={`R$ ${precoEstimado.toFixed(2)}`} readOnly className={`${styles.input} ${styles.readOnly}`}/>
                 </div>
                 <div className={styles.formGroup}>
                    <label htmlFor="precoManual" className={styles.label}>Preço Final por Pessoa (R$):</label>
                    <input type="number" id="precoManual" name="precoManual" value={precoManual} onChange={(e) => setPrecoManual(e.target.value)} required min="0" step="0.01" className={styles.input}/>
                 </div>
                 <hr className={styles.separator} />
                 {/* Removidos selects de Admin e Motorista */}
                 <div className={styles.formGroup}>
                    <label>Guia (Opcional):</label>
                    <select id="guiaUid" value={selectedGuiaUid} onChange={(e)=>setSelectedGuiaUid(e.target.value)} className={styles.input}>
                        <option value="">Nenhum</option>
                        <option value="nao_confirmado">-- Não Confirmado --</option>
                        {guias.map(g=><option key={g.uid||g.id} value={g.uid||g.id}>{g.nome}</option>)}
                    </select>
                </div>
                 <div className={styles.buttonGroup}>
                    <button type="submit" className={styles.saveButton} disabled={isLoading}>{isLoading ? 'Salvando...' : (isEditMode ? "Salvar Alterações" : "Criar Caravana")}</button>
                    <button type="button" onClick={onCancelar} className={styles.cancelButton} disabled={isLoading}>Cancelar</button>
                </div>
            </form>
        </div>
    );
}

export default FormularioCaravana;