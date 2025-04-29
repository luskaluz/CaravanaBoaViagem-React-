import React, { useState, useEffect } from 'react';
import * as api from '../../../services/api';
import styles from './AlocacaoManualModal.module.css';

function AlocacaoManualModal({ caravana, onClose, onAlocacaoSalva }) {
    const [transportesDisponiveis, setTransportesDisponiveis] = useState([]);
    const [selectedTransporteIds, setSelectedTransporteIds] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [saving, setSaving] = useState(false);

    // Calcula vagas necessárias uma vez
    const vagasNecessarias = (caravana.vagasOcupadas || 0) + (caravana.administradorUid ? 1 : 0);

    useEffect(() => {
        const currentAlocadosIds = (caravana.transportesAlocados || []).map(t => t.id);
        setSelectedTransporteIds(currentAlocadosIds);

        const fetchTransportes = async () => {
            setLoading(true); setError(null);
            try {
                const todosTransportes = await api.getTransportes();
                const disponiveisFiltrados = todosTransportes.filter(t =>
                    t.disponivel || currentAlocadosIds.includes(t.id)
                );
                setTransportesDisponiveis(disponiveisFiltrados);
            } catch (err) { setError("Erro ao buscar transportes."); console.error(err); }
            finally { setLoading(false); }
        };
        fetchTransportes();
    }, [caravana]);

    const handleCheckboxChange = (event) => {
        const { value, checked } = event.target;
        setSelectedTransporteIds(prev =>
            checked ? [...prev, value] : prev.filter(id => id !== value)
        );
    };

    const handleSalvarAlocacao = async () => {
        // Re-validação antes de enviar (boa prática)
        if (capacidadeSelecionada < vagasNecessarias) {
             setError("A capacidade selecionada é menor que a necessária.");
             return; // Impede o envio
        }
        setSaving(true); setError(null);
        try {
            await api.updateAlocacaoManual(caravana.id, selectedTransporteIds);
            onAlocacaoSalva();
        } catch (err) { setError(err.message || "Erro ao salvar."); console.error(err); }
        finally { setSaving(false); }
    };

    const capacidadeSelecionada = transportesDisponiveis
        .filter(t => selectedTransporteIds.includes(t.id))
        .reduce((sum, t) => sum + (t.assentos || 0), 0);

    // <<< Define se o botão salvar deve estar desabilitado >>>
    const isSaveDisabled = saving || loading || capacidadeSelecionada < vagasNecessarias;

    return (
        <div className={styles.modalOverlay} onClick={onClose}>
            <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
                <h2>Alocação Manual: {caravana.nomeLocalidade}</h2>
                <p>Vagas Necessárias: {vagasNecessarias}</p>

                {loading && <p className={styles.loading}>Carregando...</p>}
                {error && <p className={styles.error}>{error}</p>}

                {!loading && !error && (
                    <div className={styles.listaTransportesScroll}>
                        {transportesDisponiveis.length === 0 ? <p>Nenhum transporte.</p> :
                        transportesDisponiveis.map(t => (
                            <div key={t.id} className={styles.transporteItem}>
                                <input
                                    type="checkbox"
                                    id={`transp-manual-${t.id}`}
                                    value={t.id}
                                    checked={selectedTransporteIds.includes(t.id)}
                                    onChange={handleCheckboxChange}
                                    disabled={saving || (!t.disponivel && !selectedTransporteIds.includes(t.id))}
                                />
                                <label htmlFor={`transp-manual-${t.id}`} className={!t.disponivel && !selectedTransporteIds.includes(t.id) ? styles.indisponivelLabel : ''}>
                                    {t.nome} (Placa: {t.placa || 'N/A'}, Assentos: {t.assentos})
                                    {!t.disponivel && !selectedTransporteIds.includes(t.id) && <span className={styles.indisponivelTag}> (Indisponível)</span>}
                                </label>
                            </div>
                        ))}
                    </div>
                )}

                <div className={styles.resumoAlocacao}>
                    <p>Capacidade Total Selecionada: <strong>{capacidadeSelecionada}</strong> assentos</p>
                    {capacidadeSelecionada < vagasNecessarias && <p className={styles.aviso}>Capacidade selecionada é menor que a necessária!</p>}
                </div>

                <div className={styles.buttonGroup}>
                    {/* <<< USA a variável isSaveDisabled >>> */}
                    <button onClick={handleSalvarAlocacao} disabled={isSaveDisabled} className={styles.saveButton}>
                        {saving ? 'Salvando...' : 'Confirmar Alocação Manual'}
                    </button>
                    <button onClick={onClose} disabled={saving} className={styles.cancelButton}>Cancelar</button>
                </div>
            </div>
        </div>
    );
}

export default AlocacaoManualModal;