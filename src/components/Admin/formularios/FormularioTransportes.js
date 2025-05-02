import React, { useState, useEffect } from 'react';
import * as api from '../../../services/api'; // Verifique o caminho
import { uploadImage } from '../../../services/cloudinary'; // Verifique o caminho
import styles from './FormularioFuncionario.module.css'; // Verifique o caminho

// Renomeando para clareza, opcional
function FormularioTransporte({ transporte, onSalvar, onCancelar }) {
    // Removido 'placa' do estado inicial
    const [formData, setFormData] = useState({ nome: '', assentos: '', fornecedor: '' });
    const [imagemUrl, setImagemUrl] = useState(null);
    const [arquivoImagem, setArquivoImagem] = useState(null);
    const [previewImagem, setPreviewImagem] = useState(null);
    const [isEditMode, setIsEditMode] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [isUploading, setIsUploading] = useState(false);
    // Removido estado 'disponivel'

    useEffect(() => {
        if (transporte) {
            setIsEditMode(true);
            setFormData({
                nome: transporte.nome || '',
                assentos: transporte.assentos || '',
                fornecedor: transporte.fornecedor || '',
                // Removido 'placa'
            });
            setImagemUrl(transporte.imagemUrl || null);
            setPreviewImagem(transporte.imagemUrl || null);
            // Removido setDisponivel
            setArquivoImagem(null);
        } else {
            setIsEditMode(false);
            // Removido 'placa'
            setFormData({ nome: '', assentos: '', fornecedor: '' });
            setImagemUrl(null); setArquivoImagem(null); setPreviewImagem(null);
            // Removido setDisponivel
        }
        setError(null);
    }, [transporte]);

    // Preview de imagem (sem alterações)
    useEffect(() => {
        if (!arquivoImagem) { setPreviewImagem(imagemUrl); return; }
        const objectUrl = URL.createObjectURL(arquivoImagem); setPreviewImagem(objectUrl);
        return () => URL.revokeObjectURL(objectUrl);
    }, [arquivoImagem, imagemUrl]);

    const handleChange = (e) => { const { name, value } = e.target; setFormData(prev => ({ ...prev, [name]: value })); };
    const handleFileChange = (event) => { setError(null); const file = event.target.files[0]; if (file && file.type.startsWith('image/')) { setArquivoImagem(file); } else { setArquivoImagem(null); if(file) setError('Imagem inválida.'); event.target.value = null; } };
    const handleRemoverImagem = () => { setArquivoImagem(null); setImagemUrl(null); setPreviewImagem(null); const fileInput = document.getElementById('transp-imagem'); if (fileInput) fileInput.value = null; };
    // Removida função handleDisponibilidadeChange

    const handleSubmit = async (e) => {
        e.preventDefault(); setError(null);
        const assentosNum = parseInt(formData.assentos, 10);
        // Removida 'placa' da validação de obrigatórios
        if (!formData.nome || !formData.assentos ) { // Fornecedor é opcional aqui? Ajuste se necessário
            setError("Nome e Número de Assentos são obrigatórios."); return;
        }
        if (isNaN(assentosNum) || assentosNum <= 0) { setError("Número de Assentos inválido."); return; }
        setIsLoading(true); let finalImageUrl = imagemUrl;
        if (arquivoImagem) { setIsUploading(true); try { const url = await uploadImage(arquivoImagem); if (!url) throw new Error("Falha upload."); finalImageUrl = url; } catch (uploadError) { setError(`Erro upload: ${uploadError.message}`); setIsLoading(false); setIsUploading(false); return; } finally { setIsUploading(false); } }
        else if (!imagemUrl && !arquivoImagem) { // Se não tinha imagem e não selecionou nova, fica null
            finalImageUrl = null;
        }

        // Removidos 'placa' e 'disponivel' do objeto enviado
        const dataToSend = {
            nome: formData.nome,
            assentos: assentosNum,
            fornecedor: formData.fornecedor,
            imagemUrl: finalImageUrl,
            // Removido spread de 'disponivel'
        };

        try {
            if (isEditMode) {
                // Usando a mesma função updateTransporte, mas enviando dados simplificados
                await api.updateTransporte(transporte.id, dataToSend);
            } else {
                // Usando a mesma função createTransporte, mas enviando dados simplificados
                await api.createTransporte(dataToSend);
            }
            onSalvar(); // Chama a função passada para fechar modal/atualizar lista
        } catch (err) {
            console.error("Erro ao salvar tipo de transporte:", err);
            // Exibe o erro vindo da API, se houver
            setError(err.message || "Ocorreu um erro desconhecido.");
        }
        finally { setIsLoading(false); }
    };

    return (
        <div className={styles.container}>
            {/* Ajuste o título se quiser */}
            <h2 className={styles.title}>{isEditMode ? "Editar Tipo de Veículo" : "Adicionar Tipo de Veículo"}</h2>
            {error && <div className={styles.error}>{error}</div>}
            <form onSubmit={handleSubmit} className={styles.form}>
                 {/* Campo Nome */}
                 <div className={styles.formGroup}>
                    <label htmlFor="transp-nome" className={styles.label}>Nome do Tipo:</label>
                    <input type="text" id="transp-nome" name="nome" value={formData.nome} onChange={handleChange} required className={styles.input}/>
                 </div>
                 {/* Campo Fornecedor (Opcional?) */}
                 <div className={styles.formGroup}>
                    <label htmlFor="transp-fornecedor" className={styles.label}>Fornecedor (Opcional):</label>
                    <input type="text" id="transp-fornecedor" name="fornecedor" value={formData.fornecedor} onChange={handleChange} className={styles.input}/>
                 </div>

                 {/* CAMPO PLACA REMOVIDO */}
                 {/*
                 <div className={styles.formGroup}>
                    <label htmlFor="transp-placa" className={styles.label}>Placa:</label>
                    <input type="text" id="transp-placa" name="placa" value={formData.placa} onChange={handleChange} required className={styles.input}/>
                 </div>
                 */}

                 {/* Campo Assentos */}
                 <div className={styles.formGroup}>
                    <label htmlFor="transp-assentos" className={styles.label}>Nº de Assentos:</label>
                    <input type="number" id="transp-assentos" name="assentos" value={formData.assentos} onChange={handleChange} required min="1" className={styles.input}/>
                 </div>

                 {/* CAMPO DISPONIBILIDADE REMOVIDO */}
                 {/*
                 {isEditMode && (
                     <div className={styles.formGroupCheck}>
                        <input type="checkbox" id="transp-disponivel" name="disponivel" checked={disponivel} onChange={handleDisponibilidadeChange} className={styles.checkbox}/>
                        <label htmlFor="transp-disponivel" className={styles.labelCheck}>Disponível para Alocação</label>
                    </div>
                 )}
                 */}

                 {/* Campo Imagem (sem alterações na lógica interna) */}
                 <div className={styles.formGroup}>
                    <label htmlFor="transp-imagem" className={styles.label}>Imagem Representativa (Opcional):</label>
                     <input type="file" id="transp-imagem" onChange={handleFileChange} accept="image/*" className={styles.inputFile} disabled={isUploading}/>
                     {isUploading && <p>Enviando imagem...</p>}
                     {previewImagem && !isUploading && (
                         <div className={styles.imagemPreviewContainer}>
                              <img src={previewImagem} alt="Preview" className={styles.imagemPreview} />
                              <button type="button" onClick={handleRemoverImagem} className={styles.removeImageButton} disabled={isLoading}>Remover</button>
                         </div>
                    )}
                 </div>

                 {/* Botões (sem alterações) */}
                 <div className={styles.buttonGroup}>
                    <button type="submit" className={styles.saveButton} disabled={isLoading || isUploading}>{isLoading ? 'Salvando...' : (isEditMode ? 'Salvar Alterações' : 'Adicionar Tipo')}</button>
                    <button type="button" onClick={onCancelar} className={styles.cancelButton} disabled={isLoading || isUploading}>Cancelar</button>
                </div>
            </form>
        </div>
    );
}

// Mude a exportação se renomeou o componente
export default FormularioTransporte; // ou FormularioTransporte se não renomeou