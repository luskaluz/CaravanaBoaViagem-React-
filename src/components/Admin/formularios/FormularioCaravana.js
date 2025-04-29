import React, { useState, useEffect } from 'react';
import * as api from '../../../services/api';
import styles from './FormularioCaravana.module.css';

function FormularioCaravana({ caravana, preSelectedLocalidadeId, onSalvar, onCancelar }) {
    const [localidadeId, setLocalidadeId] = useState('');
    const [dataViagem, setDataViagem] = useState('');
    const [horarioSaida, setHorarioSaida] = useState('');
    const [despesas, setDespesas] = useState('');
    const [lucroAbsoluto, setLucroAbsoluto] = useState('');
    const [ocupacaoMinima, setOcupacaoMinima] = useState('');
    const [precoManual, setPrecoManual] = useState('');
    const [dataConfirmacaoTransporte, setDataConfirmacaoTransporte] = useState('');
    const [dataFechamentoVendas, setDataFechamentoVendas] = useState('');
    const [localidades, setLocalidades] = useState([]);
    const [admins, setAdmins] = useState([]);
    const [motoristas, setMotoristas] = useState([]);
    const [guias, setGuias] = useState([]);
    const [selectedAdminUid, setSelectedAdminUid] = useState('');
    const [selectedMotoristaUid, setSelectedMotoristaUid] = useState('');
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
                const [locData, funcData] = await Promise.all([api.getLocalidades(), api.getFuncionarios()]);
                setLocalidades(locData);
                setAdmins(funcData.filter(f => f.cargo === 'administrador'));
                setMotoristas(funcData.filter(f => f.cargo === 'motorista'));
                setGuias(funcData.filter(f => f.cargo === 'guia'));
            } catch (err) { console.error(err); setError("Falha ao carregar."); }
            finally { setLoadingResources(false); }
        };
        fetchResources();
    }, []);

    useEffect(() => {
        if (caravana) {
            setIsEditMode(true);
            setLocalidadeId(caravana.localidadeId || '');
            setDataViagem(formatDateForInput(caravana.data));
            setHorarioSaida(caravana.horarioSaida || '');
            setDespesas(caravana.despesas || '');
            setLucroAbsoluto(caravana.lucroAbsoluto || '');
            setOcupacaoMinima(caravana.ocupacaoMinima || '');
            setSelectedAdminUid(caravana.administradorUid || 'nao_confirmado');
            setSelectedMotoristaUid(caravana.motoristaUid || 'nao_confirmado');
            setSelectedGuiaUid(caravana.guiaUid || '');
            setDataConfirmacaoTransporte(formatDateForInput(caravana.dataConfirmacaoTransporte));
            setDataFechamentoVendas(formatDateForInput(caravana.dataFechamentoVendas));
            setPrecoManual(caravana.preco !== undefined ? String(caravana.preco) : '');
        } else {
            setIsEditMode(false);
            setLocalidadeId(preSelectedLocalidadeId || '');
            setDataViagem(''); setHorarioSaida('');
            setDespesas(''); setLucroAbsoluto(''); setOcupacaoMinima('');
            setSelectedAdminUid(''); setSelectedMotoristaUid(''); setSelectedGuiaUid('');
            setDataConfirmacaoTransporte(''); setDataFechamentoVendas('');
            setPrecoManual('');
        }
    }, [caravana, preSelectedLocalidadeId]);


    // --- FUNÇÃO PARA CALCULAR PREÇO ESTIMADO (PARA EXIBIÇÃO) ---
    const calcularPrecoEstimado = () => {
        const despesasNum = parseFloat(despesas);
        const lucroNum = parseFloat(lucroAbsoluto);
        const ocupacaoNum = parseInt(ocupacaoMinima, 10);

        if (!isNaN(despesasNum) && !isNaN(lucroNum) && !isNaN(ocupacaoNum) && ocupacaoNum > 0) {
            return Math.ceil((despesasNum + lucroNum) / ocupacaoNum);
        }
        return 0; // Retorna 0 se não for possível calcular
    };
    // --- FIM FUNÇÃO ---


    const handleSubmit = async (event) => {
        event.preventDefault(); setError(null);

        if (!localidadeId || !dataViagem || !despesas || !lucroAbsoluto || !ocupacaoMinima || precoManual === '') {
             setError("Preencha Localidade, Data Viagem, Despesas, Lucro, Ocup. Mínima e Preço Final."); return;
        }
        const precoNum = parseFloat(precoManual);
        if (isNaN(precoNum) || precoNum < 0) { setError("Preço Final inválido."); return; }
        if (selectedAdminUid === "") { setError("Selecione Admin ou 'Não Confirmado'."); return; }
        if (selectedMotoristaUid === "") { setError("Selecione Motorista ou 'Não Confirmado'."); return; }

        const dtViagem = new Date(dataViagem + 'T00:00:00');
        const dtConfTransp = dataConfirmacaoTransporte ? new Date(dataConfirmacaoTransporte + 'T00:00:00') : null;
        const dtFechVendas = dataFechamentoVendas ? new Date(dataFechamentoVendas + 'T00:00:00') : null;

        if (dtConfTransp && dtFechVendas && dtConfTransp > dtFechVendas) { setError("Data Conf. Transporte > Fechamento."); return; }
        if (dtFechVendas && dtViagem && dtFechVendas > dtViagem) { setError("Data Fechamento > Viagem."); return; }
        if (dtConfTransp && dtViagem && dtConfTransp > dtViagem) { setError("Data Conf. Transporte > Viagem."); return; }

        setIsLoading(true);
        const caravanaData = {
            localidadeId, data: dataViagem, horarioSaida: horarioSaida || null,
            despesas: parseFloat(despesas) || 0, lucroAbsoluto: parseFloat(lucroAbsoluto) || 0,
            ocupacaoMinima: parseInt(ocupacaoMinima, 10) || 0,
            preco: precoNum,
            administradorUid: selectedAdminUid === "nao_confirmado" ? null : selectedAdminUid,
            motoristaUid: selectedMotoristaUid === "nao_confirmado" ? null : selectedMotoristaUid,
            guiaUid: (selectedGuiaUid === "nao_confirmado" || selectedGuiaUid === "") ? null : selectedGuiaUid,
            dataConfirmacaoTransporte: dataConfirmacaoTransporte || null,
            dataFechamentoVendas: dataFechamentoVendas || null,
            // Backend inicializa vagas e campos de transporte
        };

        try {
            if (isEditMode) { await api.updateCaravana(caravana.id, caravanaData); }
            else { await api.createCaravana(caravanaData); }
            onSalvar();
        } catch (err) { console.error(err); setError(err.message); }
        finally { setIsLoading(false); }
    };

    if (loadingResources) return <div className={styles.loading}>Carregando dados...</div>;

    // Calcula o preço estimado para exibição
    const precoEstimadoExibicao = calcularPrecoEstimado();

    return (
        <div className={styles.container}>
            <h2 className={styles.title}>{isEditMode ? "Editar Caravana" : "Criar Caravana"}</h2>
            {error && <div className={styles.error}>{error}</div>}
            <form onSubmit={handleSubmit} className={styles.form}>
                 <div className={styles.formGroup}>
                    <label htmlFor="localidadeId" className={styles.label}>Localidade:</label>
                    <select id="localidadeId" value={localidadeId} onChange={(e) => setLocalidadeId(e.target.value)} required className={styles.input} disabled={!!preSelectedLocalidadeId && !isEditMode}>/*...*/</select>
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
                    <label htmlFor="dataConfirmacaoTransporte" className={styles.label}>Data Confirmação Transporte:</label>
                    <input type="date" id="dataConfirmacaoTransporte" value={dataConfirmacaoTransporte} onChange={(e) => setDataConfirmacaoTransporte(e.target.value)} className={styles.input}/>
                 </div>
                 <div className={styles.formGroup}>
                    <label htmlFor="horarioSaida" className={styles.label}>Horário Saída (Opcional):</label>
                    <input type="time" id="horarioSaida" value={horarioSaida} onChange={(e) => setHorarioSaida(e.target.value)} className={styles.input}/>
                 </div>
                 <div className={styles.formGroup}>
                     <label htmlFor="ocupacaoMinima" className={styles.label}>Ocupação Mínima (p/ Confirmação):</label>
                     <input type="number" id="ocupacaoMinima" value={ocupacaoMinima} onChange={(e) => setOcupacaoMinima(e.target.value)} required min="1" className={styles.input}/>
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

                 {/* <<< EXIBE PREÇO ESTIMADO (READONLY) >>> */}
                 <div className={styles.formGroup}>
                     <label className={styles.label}>Preço Estimado (Baseado no Mínimo):</label>
                     <input type="text" value={`R$ ${precoEstimadoExibicao.toFixed(2)}`} readOnly className={`${styles.input} ${styles.readOnly}`}/>
                 </div>

                 {/* <<< INPUT PARA PREÇO FINAL MANUAL >>> */}
                 <div className={styles.formGroup}>
                    <label htmlFor="precoManual" className={styles.label}>Preço Final por Pessoa (R$):</label>
                    <input type="number" id="precoManual" name="precoManual" value={precoManual} onChange={(e) => setPrecoManual(e.target.value)} required min="0" step="0.01" className={styles.input}/>
                 </div>

                 <hr className={styles.separator} />
                 {/* ... Selects de Funcionários ... */}
                 <div className={styles.formGroup}><label>Administrador:</label><select id="administradorUid" value={selectedAdminUid} onChange={(e)=>setSelectedAdminUid(e.target.value)} required className={styles.input}><option value="">Selecione...</option><option value="nao_confirmado">-- Não Confirmado --</option>{admins.map(a=><option key={a.uid||a.id} value={a.uid||a.id}>{a.nome}</option>)}</select></div>
                 <div className={styles.formGroup}><label>Motorista:</label><select id="motoristaUid" value={selectedMotoristaUid} onChange={(e)=>setSelectedMotoristaUid(e.target.value)} required className={styles.input}><option value="">Selecione...</option><option value="nao_confirmado">-- Não Confirmado --</option>{motoristas.map(m=><option key={m.uid||m.id} value={m.uid||m.id}>{m.nome}</option>)}</select></div>
                 <div className={styles.formGroup}><label>Guia (Opcional):</label><select id="guiaUid" value={selectedGuiaUid} onChange={(e)=>setSelectedGuiaUid(e.target.value)} className={styles.input}><option value="">Nenhum</option><option value="nao_confirmado">-- Não Confirmado --</option>{guias.map(g=><option key={g.uid||g.id} value={g.uid||g.id}>{g.nome}</option>)}</select></div>

                 <div className={styles.buttonGroup}>
                    <button type="submit" className={styles.saveButton} disabled={isLoading}>{isLoading ? 'Salvando...' : (isEditMode ? "Salvar Alterações" : "Criar Caravana")}</button>
                    <button type="button" onClick={onCancelar} className={styles.cancelButton} disabled={isLoading}>Cancelar</button>
                </div>
            </form>
        </div>
    );
}

export default FormularioCaravana;