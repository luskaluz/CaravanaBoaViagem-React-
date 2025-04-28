import React, { useState, useEffect } from 'react';
import * as api from '../../../services/api';
import styles from './FormularioCaravana.module.css';

function FormularioCaravana({ caravana, preSelectedLocalidadeId, onSalvar, onCancelar }) {
    // Estados básicos
    const [localidadeId, setLocalidadeId] = useState('');
    const [dataViagem, setDataViagem] = useState(''); // Renomeado de 'data' para clareza
    const [horarioSaida, setHorarioSaida] = useState('');
    const [vagasTotais, setVagasTotais] = useState('');
    const [despesas, setDespesas] = useState('');
    const [lucroAbsoluto, setLucroAbsoluto] = useState('');
    const [ocupacaoMinima, setOcupacaoMinima] = useState('');
    const [precoCalculado, setPrecoCalculado] = useState(0);

    // <<< NOVOS ESTADOS PARA DATAS >>>
    const [dataConfirmacaoTransporte, setDataConfirmacaoTransporte] = useState('');
    const [dataFechamentoVendas, setDataFechamentoVendas] = useState('');

    // Estados para dropdowns
    const [localidades, setLocalidades] = useState([]);
    const [admins, setAdmins] = useState([]);
    const [motoristas, setMotoristas] = useState([]);
    const [guias, setGuias] = useState([]);
    const [selectedAdminUid, setSelectedAdminUid] = useState('');
    const [selectedMotoristaUid, setSelectedMotoristaUid] = useState('');
    const [selectedGuiaUid, setSelectedGuiaUid] = useState('');

    // Estados de controle
    const [isEditMode, setIsEditMode] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [loadingResources, setLoadingResources] = useState(true);

    // Função para formatar data vinda do Firestore/backend para input type="date"
    const formatDateForInput = (dateString) => {
        if (!dateString) return '';
        try {
            // Tenta criar data e extrair YYYY-MM-DD
            return new Date(dateString).toISOString().split('T')[0];
        } catch (e) {
            // Se falhar (formato inválido), retorna string vazia
            console.warn("Formato de data inválido recebido:", dateString);
            return '';
        }
    };

    // Busca recursos (sem alterações)
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

    // Preenche formulário (ATUALIZADO)
    useEffect(() => {
        if (caravana) {
            setIsEditMode(true);
            setLocalidadeId(caravana.localidadeId || '');
            setDataViagem(formatDateForInput(caravana.data)); // Usa função helper
            setHorarioSaida(caravana.horarioSaida || '');
            setVagasTotais(caravana.vagasTotais || '');
            setDespesas(caravana.despesas || '');
            setLucroAbsoluto(caravana.lucroAbsoluto || '');
            setOcupacaoMinima(caravana.ocupacaoMinima || '');
            setSelectedAdminUid(caravana.administradorUid || 'nao_confirmado');
            setSelectedMotoristaUid(caravana.motoristaUid || 'nao_confirmado');
            setSelectedGuiaUid(caravana.guiaUid || '');
            // <<< POPULA NOVAS DATAS >>>
            setDataConfirmacaoTransporte(formatDateForInput(caravana.dataConfirmacaoTransporte));
            setDataFechamentoVendas(formatDateForInput(caravana.dataFechamentoVendas));
        } else {
            setIsEditMode(false);
            setLocalidadeId(preSelectedLocalidadeId || '');
            setDataViagem(''); setHorarioSaida(''); setVagasTotais('');
            setDespesas(''); setLucroAbsoluto(''); setOcupacaoMinima('');
            setSelectedAdminUid(''); setSelectedMotoristaUid(''); setSelectedGuiaUid('');
            // <<< RESETA NOVAS DATAS >>>
            setDataConfirmacaoTransporte(''); setDataFechamentoVendas('');
            setPrecoCalculado(0);
        }
    }, [caravana, preSelectedLocalidadeId]);

    // Calcula preço (sem alterações)
    useEffect(() => {
        const d = parseFloat(despesas); const l = parseFloat(lucroAbsoluto); const o = parseInt(ocupacaoMinima, 10);
        if (!isNaN(d) && !isNaN(l) && !isNaN(o) && o > 0) { setPrecoCalculado(Math.ceil((d + l) / o)); }
        else if (!isEditMode && (!d || !l || !o)) { setPrecoCalculado(0); }
        else if (isEditMode && caravana) {
             const dO = parseFloat(caravana.despesas||0); const lO = parseFloat(caravana.lucroAbsoluto||0); const oO = parseInt(caravana.ocupacaoMinima||0, 10);
             if (!isNaN(dO) && !isNaN(lO) && !isNaN(oO) && oO > 0) { setPrecoCalculado(Math.ceil((dO + lO) / oO)); }
             else { setPrecoCalculado(caravana.preco || 0); }
        }
    }, [despesas, lucroAbsoluto, ocupacaoMinima, isEditMode, caravana]);

    // Submit (ATUALIZADO)
    const handleSubmit = async (event) => {
        event.preventDefault(); setError(null);

        // Validações básicas + seleção inicial admin/motorista
        if (!localidadeId || !dataViagem || !vagasTotais || !despesas || !lucroAbsoluto || !ocupacaoMinima) {
             setError("Preencha todos os campos básicos da caravana."); return;
        }
        if (selectedAdminUid === "") { setError("Selecione um Admin ou 'Não Confirmado'."); return; }
        if (selectedMotoristaUid === "") { setError("Selecione um Motorista ou 'Não Confirmado'."); return; }
        // Opcional: Validar ordem das datas aqui no frontend também
        if (dataConfirmacaoTransporte && dataFechamentoVendas && dataConfirmacaoTransporte > dataFechamentoVendas) {
             setError("Data de Confirmação do Transporte não pode ser depois da Data de Fechamento."); return;
        }
         if (dataFechamentoVendas && dataViagem && dataFechamentoVendas > dataViagem) {
             setError("Data de Fechamento não pode ser depois da Data da Viagem."); return;
        }


        setIsLoading(true);
        const caravanaData = {
            localidadeId,
            data: dataViagem, // Usa o estado renomeado
            horarioSaida: horarioSaida || null,
            vagasTotais: parseInt(vagasTotais, 10) || 0,
            despesas: parseFloat(despesas) || 0,
            lucroAbsoluto: parseFloat(lucroAbsoluto) || 0,
            ocupacaoMinima: parseInt(ocupacaoMinima, 10) || 0,
            administradorUid: selectedAdminUid === "nao_confirmado" ? null : selectedAdminUid,
            motoristaUid: selectedMotoristaUid === "nao_confirmado" ? null : selectedMotoristaUid,
            guiaUid: (selectedGuiaUid === "nao_confirmado" || selectedGuiaUid === "") ? null : selectedGuiaUid,
            preco: precoCalculado,
            // <<< ADICIONA NOVAS DATAS (envia null se vazio) >>>
            dataConfirmacaoTransporte: dataConfirmacaoTransporte || null,
            dataFechamentoVendas: dataFechamentoVendas || null,
        };

        try {
            if (isEditMode) { await api.updateCaravana(caravana.id, caravanaData); }
            else { await api.createCaravana(caravanaData); }
            onSalvar();
        } catch (err) { console.error(err); setError(err.message); }
        finally { setIsLoading(false); }
    };

    if (loadingResources) return <div className={styles.loading}>Carregando...</div>;

    // --- JSX ATUALIZADO ---
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

                 {/* Data da Viagem */}
                 <div className={styles.formGroup}>
                    <label htmlFor="dataViagem" className={styles.label}>Data da Viagem:</label>
                    <input type="date" id="dataViagem" value={dataViagem} onChange={(e) => setDataViagem(e.target.value)} required className={styles.input}/>
                 </div>


                <div className={styles.formGroup}>
                    <label htmlFor="dataConfirmacaoTransporte" className={styles.label}>Data Confirmação do Transporte:</label>
                    <input type="date" id="dataConfirmacaoTransporte" value={dataConfirmacaoTransporte} onChange={(e) => setDataConfirmacaoTransporte(e.target.value)} className={styles.input}/>
                 </div>



                 <div className={styles.formGroup}>
                    <label htmlFor="dataFechamentoVendas" className={styles.label}>Data Fechamento de Vendas:</label>
                    <input type="date" id="dataFechamentoVendas" value={dataFechamentoVendas} onChange={(e) => setDataFechamentoVendas(e.target.value)} className={styles.input}/>
                 </div>

                 

                 <div className={styles.formGroup}>
                    <label htmlFor="horarioSaida" className={styles.label}>Horário Saída:</label>
                    <input type="time" id="horarioSaida" value={horarioSaida} onChange={(e) => setHorarioSaida(e.target.value)} className={styles.input}/>
                 </div>

                 <div className={styles.formRow}>
                     <div className={styles.formGroup}>
                         <label htmlFor="vagasTotais" className={styles.label}>Vagas Totais:</label>
                         <input type="number" id="vagasTotais" value={vagasTotais} onChange={(e) => setVagasTotais(e.target.value)} required min="1" className={styles.input}/>
                     </div>
                     <div className={styles.formGroup}>
                         <label htmlFor="ocupacaoMinima" className={styles.label}>Ocupação Mínima:</label>
                         <input type="number" id="ocupacaoMinima" value={ocupacaoMinima} onChange={(e) => setOcupacaoMinima(e.target.value)} required min="1" className={styles.input}/>
                     </div>
                 </div>
                 <div className={styles.formRow}>
                    <div className={styles.formGroup}>
                         <label htmlFor="despesas" className={styles.label}>Despesas (R$):</label>
                         <input type="number" id="despesas" value={despesas} onChange={(e) => setDespesas(e.target.value)} required min="0" step="0.01" className={styles.input}/>
                     </div>
                     <div className={styles.formGroup}>
                         <label htmlFor="lucroAbsoluto" className={styles.label}>Lucro Desejado (R$):</label>
                         <input type="number" id="lucroAbsoluto" value={lucroAbsoluto} onChange={(e) => setLucroAbsoluto(e.target.value)} required min="0" step="0.01" className={styles.input}/>
                     </div>
                 </div>
                 <div className={styles.formGroup}>
                     <label className={styles.label}>Preço por Pessoa (Calculado):</label>
                     <input type="text" value={`R$ ${precoCalculado.toFixed(2)}`} readOnly className={`${styles.input} ${styles.readOnly}`}/>
                 </div>

                 <hr className={styles.separator} />

                 <div className={styles.formGroup}>
                     <label htmlFor="administradorUid" className={styles.label}>Administrador:</label>
                     <select id="administradorUid" value={selectedAdminUid} onChange={(e) => setSelectedAdminUid(e.target.value)} required className={styles.input}>
                         <option value="">Selecione...</option>
                         <option value="nao_confirmado">-- Não Confirmado --</option>
                         {admins.map(adm => ( <option key={adm.uid || adm.id} value={adm.uid || adm.id}>{adm.nome}</option> ))}
                    </select>
                </div>
                 <div className={styles.formGroup}>
                    <label htmlFor="motoristaUid" className={styles.label}>Motorista:</label>
                     <select id="motoristaUid" value={selectedMotoristaUid} onChange={(e) => setSelectedMotoristaUid(e.target.value)} required className={styles.input}>
                        <option value="">Selecione...</option>
                        <option value="nao_confirmado">-- Não Confirmado --</option>
                        {motoristas.map(mot => ( <option key={mot.uid || mot.id} value={mot.uid || mot.id}>{mot.nome}</option> ))}
                    </select>
                 </div>
                <div className={styles.formGroup}>
                    <label htmlFor="guiaUid" className={styles.label}>Guia (Opcional):</label>
                    <select id="guiaUid" value={selectedGuiaUid} onChange={(e) => setSelectedGuiaUid(e.target.value)} className={styles.input}>
                        <option value="">Nenhum Guia</option>
                        <option value="nao_confirmado">-- Não Confirmado --</option>
                        {guias.map(guia => ( <option key={guia.uid || guia.id} value={guia.uid || guia.id}>{guia.nome}</option> ))}
                    </select>
                </div>

                <div className={styles.buttonGroup}>
                    <button type="submit" className={styles.saveButton} disabled={isLoading}>
                        {isLoading ? 'Salvando...' : (isEditMode ? "Salvar Alterações" : "Criar Caravana")}
                    </button>
                    <button type="button" onClick={onCancelar} className={styles.cancelButton} disabled={isLoading}>
                        Cancelar
                    </button>
                </div>
            </form>
        </div>
    );
}

export default FormularioCaravana;