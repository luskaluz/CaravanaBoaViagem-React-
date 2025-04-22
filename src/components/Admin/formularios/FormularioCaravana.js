import React, { useState, useEffect } from 'react';
import * as api from '../../../services/api';
import styles from './FormularioCaravana.module.css';

function FormularioCaravana({ caravana, preSelectedLocalidadeId, onSalvar, onCancelar }) {
    const [localidadeId, setLocalidadeId] = useState('');
    const [data, setData] = useState('');
    const [horarioSaida, setHorarioSaida] = useState('');
    const [vagasTotais, setVagasTotais] = useState('');
    const [despesas, setDespesas] = useState('');
    const [lucroAbsoluto, setLucroAbsoluto] = useState('');
    const [ocupacaoMinima, setOcupacaoMinima] = useState('');
    const [precoCalculado, setPrecoCalculado] = useState(0);
    const [localidades, setLocalidades] = useState([]);
    const [funcionarios, setFuncionarios] = useState([]);
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

    useEffect(() => {
        const fetchResources = async () => {
            setLoadingResources(true);
            setError(null);
            try {
                const [localidadesData, funcionariosData] = await Promise.all([
                    api.getLocalidades(),
                    api.getFuncionarios()
                ]);
                setLocalidades(localidadesData);
                setFuncionarios(funcionariosData);
                setAdmins(funcionariosData.filter(f => f.cargo === 'administrador'));
                setMotoristas(funcionariosData.filter(f => f.cargo === 'motorista'));
                setGuias(funcionariosData.filter(f => f.cargo === 'guia'));
            } catch (err) {
                console.error("Erro ao buscar recursos:", err);
                setError("Falha ao carregar localidades ou funcionários.");
            } finally {
                setLoadingResources(false);
            }
        };
        fetchResources();
    }, []);

    useEffect(() => {
        if (caravana) {
            setIsEditMode(true);
            setLocalidadeId(caravana.localidadeId || '');
            const dataFormatada = caravana.data ? new Date(caravana.data).toISOString().split('T')[0] : '';
            setData(dataFormatada);
            setHorarioSaida(caravana.horarioSaida || '');
            setVagasTotais(caravana.vagasTotais || '');
            setDespesas(caravana.despesas || '');
            setLucroAbsoluto(caravana.lucroAbsoluto || '');
            setOcupacaoMinima(caravana.ocupacaoMinima || '');
            // Se UID for null no DB, seleciona 'nao_confirmado', senão o UID
            setSelectedAdminUid(caravana.administradorUid || 'nao_confirmado');
            setSelectedMotoristaUid(caravana.motoristaUid || 'nao_confirmado');
            setSelectedGuiaUid(caravana.guiaUid || ''); // Guia pode ser 'nenhum' ('')
        } else {
            setIsEditMode(false);
            setLocalidadeId(preSelectedLocalidadeId || '');
            setData(''); setHorarioSaida(''); setVagasTotais('');
            setDespesas(''); setLucroAbsoluto(''); setOcupacaoMinima('');
            setSelectedAdminUid(''); setSelectedMotoristaUid(''); setSelectedGuiaUid('');
            setPrecoCalculado(0);
        }
    }, [caravana, preSelectedLocalidadeId]);

    useEffect(() => {
        const despesasNum = parseFloat(despesas);
        const lucroNum = parseFloat(lucroAbsoluto);
        const ocupacaoNum = parseInt(ocupacaoMinima, 10);
        if (!isNaN(despesasNum) && !isNaN(lucroNum) && !isNaN(ocupacaoNum) && ocupacaoNum > 0) {
            const precoCalc = (despesasNum + lucroNum) / ocupacaoNum;
            setPrecoCalculado(Math.ceil(precoCalc));
        } else if (!isEditMode && (!despesas || !lucroAbsoluto || !ocupacaoMinima)) {
             setPrecoCalculado(0);
        } else if (isEditMode && caravana) {
             const despesasOrig = parseFloat(caravana.despesas || 0);
             const lucroOrig = parseFloat(caravana.lucroAbsoluto || 0);
             const ocupacaoOrig = parseInt(caravana.ocupacaoMinima || 0, 10);
              if (!isNaN(despesasOrig) && !isNaN(lucroOrig) && !isNaN(ocupacaoOrig) && ocupacaoOrig > 0) {
                  setPrecoCalculado(Math.ceil((despesasOrig + lucroOrig) / ocupacaoOrig));
              } else {
                   setPrecoCalculado(caravana.preco || 0);
              }
        }
    }, [despesas, lucroAbsoluto, ocupacaoMinima, isEditMode, caravana]);

    const handleSubmit = async (event) => {
        event.preventDefault();
        setError(null);

        if (!localidadeId || !data || !vagasTotais || !despesas || !lucroAbsoluto || !ocupacaoMinima) {
             setError("Preencha todos os campos de cálculo.");
             return;
        }
        // --- VALIDAÇÃO CORRIGIDA: Apenas impede se for "" (Selecione...) ---
        if (selectedAdminUid === "") {
             setError("Selecione um Administrador ou marque como 'Não Confirmado'.");
             return;
        }
        if (selectedMotoristaUid === "") {
            setError("Selecione um Motorista ou marque como 'Não Confirmado'.");
            return;
        }
        // --- FIM VALIDAÇÃO ---

        setIsLoading(true);

        const caravanaData = {
            localidadeId,
            data,
            horarioSaida: horarioSaida || null,
            vagasTotais: parseInt(vagasTotais, 10) || 0,
            despesas: parseFloat(despesas) || 0,
            lucroAbsoluto: parseFloat(lucroAbsoluto) || 0,
            ocupacaoMinima: parseInt(ocupacaoMinima, 10) || 0,
            // --- Envio CORRIGIDO: Envia NULL se 'nao_confirmado' ---
            administradorUid: selectedAdminUid === "nao_confirmado" ? null : selectedAdminUid,
            motoristaUid: selectedMotoristaUid === "nao_confirmado" ? null : selectedMotoristaUid,
            guiaUid: (selectedGuiaUid === "nao_confirmado" || selectedGuiaUid === "") ? null : selectedGuiaUid,
            preco: precoCalculado
        };

        try {
            if (isEditMode) {
                await api.updateCaravana(caravana.id, caravanaData);
            } else {
                await api.createCaravana(caravanaData);
            }
            onSalvar();

        } catch (err) {
            console.error('Erro ao salvar caravana:', err);
            setError(err.response?.data?.error || err.message || `Erro ao ${isEditMode ? 'atualizar' : 'criar'} caravana.`);
        } finally {
            setIsLoading(false);
        }
    };

    if (loadingResources) {
        return <div className={styles.loading}>Carregando recursos...</div>;
    }

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
                 <div className={styles.formRow}>
                     <div className={styles.formGroup}>
                         <label htmlFor="data" className={styles.label}>Data:</label>
                         <input type="date" id="data" value={data} onChange={(e) => setData(e.target.value)} required className={styles.input}/>
                     </div>
                     <div className={styles.formGroup}>
                         <label htmlFor="horarioSaida" className={styles.label}>Horário Saída (Opcional):</label>
                         <input type="time" id="horarioSaida" value={horarioSaida} onChange={(e) => setHorarioSaida(e.target.value)} className={styles.input}/>
                     </div>
                 </div>
                 <div className={styles.formRow}>
                     <div className={styles.formGroup}>
                         <label htmlFor="vagasTotais" className={styles.label}>Vagas Totais:</label>
                         <input type="number" id="vagasTotais" value={vagasTotais} onChange={(e) => setVagasTotais(e.target.value)} required min="1" className={styles.input}/>
                     </div>
                     <div className={styles.formGroup}>
                         <label htmlFor="ocupacaoMinima" className={styles.label}>Ocup. Mínima:</label>
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