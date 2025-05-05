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
    const [pontoEncontro, setPontoEncontro] = useState('');
    // --- ESTADOS DE RETORNO SEPARADOS ---
    const [dataRetorno, setDataRetorno] = useState('');
    const [horarioRetorno, setHorarioRetorno] = useState('');
    // --- FIM ESTADOS DE RETORNO ---
    const [localidades, setLocalidades] = useState([]);
    const [funcionarios, setFuncionarios] = useState([]);
    const [guias, setGuias] = useState([]);
    const [selectedGuiaUid, setSelectedGuiaUid] = useState('');
    const [isEditMode, setIsEditMode] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [loadingResources, setLoadingResources] = useState(true);

    const formatDateForInput = (dateString) => {
        if (!dateString) return '';
        try {
            const dt = new Date(dateString);
            if (!isNaN(dt.getTime())) { return dt.toISOString().split('T')[0]; }
        } catch (e) { console.warn("Data inválida(F):", dateString); }
        return '';
    };

    // Extrai apenas HH:mm de um ISO string ou Date object
    const formatTimeForInput = (dateTimeStringOrDate) => {
         if (!dateTimeStringOrDate) return '';
         try {
            const dt = new Date(dateTimeStringOrDate);
            if (!isNaN(dt.getTime())) {
                // Pega hora e minuto UTC e formata
                const hours = String(dt.getUTCHours()).padStart(2, '0');
                const minutes = String(dt.getUTCMinutes()).padStart(2, '0');
                return `${hours}:${minutes}`;
            }
         } catch(e) { console.warn("Data/Hora inválida(T):", dateTimeStringOrDate); }
         return '';
    };

    useEffect(() => {
        const fetchResources = async () => {
            setLoadingResources(true); setError(null);
            try {
                const [locData, funcData] = await Promise.all([ api.getLocalidades(), api.getFuncionarios() ]);
                setLocalidades(locData);
                setFuncionarios(funcData);
                setGuias(funcData.filter(f => f.cargo === 'guia'));
            } catch (err) { console.error(err); setError("Falha recursos."); }
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
            setSelectedGuiaUid(caravana.guiaUid || '');
            setDataConfirmacaoTransporte(formatDateForInput(caravana.dataConfirmacaoTransporte));
            setDataFechamentoVendas(formatDateForInput(caravana.dataFechamentoVendas));
            setPontoEncontro(caravana.pontoEncontro || '');
            // --- SETA ESTADOS SEPARADOS ---
            setDataRetorno(formatDateForInput(caravana.dataHoraRetorno)); // Pega só a data
            setHorarioRetorno(formatTimeForInput(caravana.dataHoraRetorno)); // Pega só a hora
            // --- FIM ---
        } else {
            setIsEditMode(false);
            setLocalidadeId(preSelectedLocalidadeId || '');
            setDataViagem(''); setHorarioSaida('');
            setDespesas(''); setLucroAbsoluto(''); setOcupacaoMinima('');
            setPrecoManual(''); setMaximoTransportes('');
            setSelectedGuiaUid('');
            setDataConfirmacaoTransporte(''); setDataFechamentoVendas('');
            setPontoEncontro('');
             // --- RESETA ESTADOS SEPARADOS ---
            setDataRetorno(''); setHorarioRetorno('');
             // --- FIM ---
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
    
        let dataHoraRetornoParaSalvar = null;
        let dtViagemObj;
    
        if (dataRetorno || horarioRetorno) {
            if (!dataRetorno || !horarioRetorno) {
                 setError("Se informar a Data de Retorno, informe também o Horário (e vice-versa)."); return;
            }
            try {
                 // Valida a data da viagem primeiro
                 if (!dataViagem) { setError("Data da Viagem é obrigatória."); return; }
                 // Cria data da viagem como objeto Date local para comparação
                 // IMPORTANTE: Não usar 'Z' aqui para comparação local
                 dtViagemObj = new Date(`${dataViagem}T00:00:00`);
                 if(isNaN(dtViagemObj.getTime())) throw new Error("Data da Viagem inválida");
    
                 // Combina data e hora do retorno SEM o 'Z' para criar no fuso local
                 const combinedLocalString = `${dataRetorno}T${horarioRetorno}`;
                 const dtRetorno = new Date(combinedLocalString);
                 if (isNaN(dtRetorno.getTime())) throw new Error("Data/Hora de Retorno inválida");
    
                 // Compara os tempos locais
                 if (dtRetorno.getTime() <= dtViagemObj.getTime()) {
                     setError("Data/Hora de Retorno deve ser posterior à Data da Viagem."); return;
                 }
                 // CONVERTE para ISO string (UTC) APENAS para salvar no banco
                 dataHoraRetornoParaSalvar = dtRetorno.toISOString();
    
            } catch (e) {
                 setError("Formato inválido para Data ou Hora de Retorno ou Data da Viagem."); return;
            }
        } else {
            // Se não definiu retorno, ainda precisa validar dataViagem
             try {
                // Apenas valida a data da viagem, não precisa guardar o objeto Date aqui
                const dtCheck = new Date(dataViagem + 'T00:00:00Z');
                 if(isNaN(dtCheck.getTime())) throw new Error("Data da Viagem inválida");
             } catch(e) {
                 setError("Formato inválido para Data da Viagem."); return;
             }
        }
    
        const precoNum = parseFloat(precoManual);
        if (isNaN(precoNum) || precoNum < 0) { setError("Preço Final inválido."); return; }
        const maxTranspNum = parseInt(maximoTransportes, 10);
        if (isNaN(maxTranspNum) || maxTranspNum <= 0) { setError("Nº Máx. Transportes inválido."); return; }
        const ocupacaoMinNum = parseInt(ocupacaoMinima, 10);
        if (isNaN(ocupacaoMinNum) || ocupacaoMinNum <= 0) { setError("Ocupação Mínima inválida."); return; }
    
        // Comparações de datas podem usar as strings YYYY-MM-DD diretamente
        const dtConfTranspStr = dataConfirmacaoTransporte;
        const dtFechVendasStr = dataFechamentoVendas;
        const dtViagemStr = dataViagem; // Já é YYYY-MM-DD
    
        if (dtConfTranspStr && dtFechVendasStr && dtConfTranspStr > dtFechVendasStr) { setError("Data Conf. Transporte > Data Fechamento."); return; }
        if (dtFechVendasStr && dtViagemStr && dtFechVendasStr > dtViagemStr) { setError("Data Fechamento > Data Viagem."); return; }
        if (dtConfTranspStr && dtViagemStr && dtConfTranspStr > dtViagemStr) { setError("Data Conf. Transporte > Data Viagem."); return; }
    
    
        setIsLoading(true);
        const caravanaData = {
            localidadeId,
            data: dataViagem, // Envia string YYYY-MM-DD
            horarioSaida: horarioSaida || null,
            despesas: parseFloat(despesas) || 0, lucroAbsoluto: parseFloat(lucroAbsoluto) || 0,
            ocupacaoMinima: ocupacaoMinNum, preco: precoNum,
            maximoTransportes: maxTranspNum,
            guiaUid: (selectedGuiaUid === "nao_confirmado" || selectedGuiaUid === "") ? null : selectedGuiaUid,
            dataConfirmacaoTransporte: dataConfirmacaoTransporte,
            dataFechamentoVendas: dataFechamentoVendas || null,
            pontoEncontro: pontoEncontro || null,
            dataHoraRetorno: dataHoraRetornoParaSalvar, // Envia ISO string UTC ou null
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
                    <label htmlFor="pontoEncontro" className={styles.label}>Ponto de Encontro:</label>
                    <input type="text" id="pontoEncontro" value={pontoEncontro} onChange={(e) => setPontoEncontro(e.target.value)} className={styles.input} />
                 </div>
                 <div className={styles.formRow}>
                    <div className={styles.formGroup}>
                        <label htmlFor="dataViagem" className={styles.label}>Data da Viagem:</label>
                        <input type="date" id="dataViagem" value={dataViagem} onChange={(e) => setDataViagem(e.target.value)} required className={styles.input}/>
                    </div>    
                        <div className={styles.formGroup}>
                        <label htmlFor="horarioSaida" className={styles.label}>Horário Saída:</label>
                        <input type="time" id="horarioSaida" value={horarioSaida} onChange={(e) => setHorarioSaida(e.target.value)} className={styles.input}/>
                     </div>
                    
                 </div>   
                 <div className={styles.formRow}>
                     <div className={styles.formGroup}>
                        <label htmlFor="dataRetorno" className={styles.label}>Data Retorno:</label>
                        <input type="date" id="dataRetorno" value={dataRetorno} onChange={(e) => setDataRetorno(e.target.value)} className={styles.input}/>
                    </div>
                    <div className={styles.formGroup}>
                        <label htmlFor="horarioRetorno" className={styles.label}>Horário Retorno:</label>
                        <input type="time" id="horarioRetorno" value={horarioRetorno} onChange={(e) => setHorarioRetorno(e.target.value)} className={styles.input}/>
                    </div>
                </div>

                 
                {/* --- FIM AGRUPAMENTO --- */}

                 <div className={styles.formGroup}>
                    <label htmlFor="dataFechamentoVendas" className={styles.label}>Data Limite Venda Ingressos:</label>
                    <input type="date" id="dataFechamentoVendas" value={dataFechamentoVendas} onChange={(e) => setDataFechamentoVendas(e.target.value)} className={styles.input}/>
                 </div>
                 <div className={styles.formGroup}>
                    <label htmlFor="dataConfirmacaoTransporte" className={styles.label}>Data Definição Transporte:</label>
                    <input type="date" id="dataConfirmacaoTransporte" value={dataConfirmacaoTransporte} onChange={(e) => setDataConfirmacaoTransporte(e.target.value)} required className={styles.input}/>
                 </div>
                 <div className={styles.formRow}>
                    <div className={styles.formGroup}>
                        <label htmlFor="ocupacaoMinima" className={styles.label}>Ocupação Mínima:</label>
                        <input type="number" id="ocupacaoMinima" value={ocupacaoMinima} onChange={(e) => setOcupacaoMinima(e.target.value)} required min="1" className={styles.input}/>
                    </div>
                    <div className={styles.formGroup}>
                        <label htmlFor="maximoTransportes" className={styles.label}>Nº Máx. Transportes:</label>
                        <input type="number" id="maximoTransportes" value={maximoTransportes} onChange={(e) => setMaximoTransportes(e.target.value)} required min="1" className={styles.input} placeholder="Ex: 2"/>
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