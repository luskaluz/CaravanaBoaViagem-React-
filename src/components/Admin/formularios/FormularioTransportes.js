import React, { useState, useEffect } from 'react';
import * as api from '../../../services/api';
import { uploadImage } from '../../../services/cloudinary';
import styles from './FormularioFuncionario.module.css'; // Reutilize estilos

function FormularioTransporte({ transporte, onSalvar, onCancelar }) {
    // Removido placa, fornecedor (opcional), disponibilidade
    const [formData, setFormData] = useState({ nome: '', assentos: '', fornecedor: '' }); // Mantido fornecedor por enquanto
    const [imagemUrl, setImagemUrl] = useState(null);
    const [arquivoImagem, setArquivoImagem] = useState(null);
    const [previewImagem, setPreviewImagem] = useState(null);
    const [isEditMode, setIsEditMode] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [isUploading, setIsUploading] = useState(false);

    useEffect(() => {
        if (transporte) {
            setIsEditMode(true);
            setFormData({
                nome: transporte.nome || '',
                assentos: transporte.assentos || '',
                fornecedor: transporte.fornecedor || '', // Popula fornecedor
            });
            setImagemUrl(transporte.imagemUrl || null);
            setPreviewImagem(transporte.imagemUrl || null);
            setArquivoImagem(null);
        } else {
            setIsEditMode(false);
            setFormData({ nome: '', assentos: '', fornecedor: '' }); // Reseta
            setImagemUrl(null); setArquivoImagem(null); setPreviewImagem(null);
        }
        setError(null);
    }, [transporte]);

    useEffect(() => { // Preview imagem
        if (!arquivoImagem) { setPreviewImagem(imagemUrl); return; }
        const objectUrl = URL.createObjectURL(arquivoImagem); setPreviewImagem(objectUrl);
        return () => URL.revokeObjectURL(objectUrl);
    }, [arquivoImagem, imagemUrl]);

    const handleChange = (e) => { /* ... como antes ... */ };
    const handleFileChange = (event) => { /* ... como antes ... */ };
    const handleRemoverImagem = () => { /* ... como antes ... */ };

    const handleSubmit = async (e) => {
        e.preventDefault(); setError(null);
        const assentosNum = parseInt(formData.assentos, 10);

        // Validação sem placa
        if (!formData.nome || !formData.assentos || !formData.fornecedor) {
            setError("Nome, Assentos e Fornecedor são obrigatórios."); return;
        }
        if (isNaN(assentosNum) || assentosNum <= 0) { setError("Assentos inválidos."); return; }

        setIsLoading(true);
        let finalImageUrl = imagemUrl;
        if (arquivoImagem) { /* ... lógica de upload ... */ }
        else if (!imagemUrl) { finalImageUrl = null; }

        // Dados sem placa, disponibilidade ou quantidade
        const dataToSend = {
            nome: formData.nome,
            assentos: assentosNum,
            imagemUrl: finalImageUrl,
            fornecedor: formData.fornecedor,
        };

        try {
            if (isEditMode) { await api.updateTransporte(transporte.id, dataToSend); }
            else { await api.createTransporte(dataToSend); }
            onSalvar();
        } catch (err) { console.error(err); setError(err.message); }
        finally { setIsLoading(false); }
    };

    return (
        <div className={styles.container}>
            <h2 className={styles.title}>{isEditMode ? "Editar Tipo Transporte" : "Criar Tipo Transporte"}</h2>
            {error && <div className={styles.error}>{error}</div>}
            <form onSubmit={handleSubmit} className={styles.form}>
                 <div className={styles.formGroup}>
                    <label htmlFor="tipo-transp-nome" className={styles.label}>Nome do Tipo:</label>
                    <input type="text" id="tipo-transp-nome" name="nome" value={formData.nome} onChange={handleChange} required className={styles.input}/>
                 </div>
                 <div className={styles.formGroup}>
                    <label htmlFor="tipo-transp-fornecedor" className={styles.label}>Fornecedor Padrão:</label>
                    <input type="text" id="tipo-transp-fornecedor" name="fornecedor" value={formData.fornecedor} onChange={handleChange} required className={styles.input}/>
                 </div>
                 {/* <<< REMOVIDO INPUT PLACA >>> */}
                 <div className={styles.formGroup}>
                    <label htmlFor="tipo-transp-assentos" className={styles.label}>Nº de Assentos Padrão:</label>
                    <input type="number" id="tipo-transp-assentos" name="assentos" value={formData.assentos} onChange={handleChange} required min="1" className={styles.input}/>
                 </div>
                 {/* <<< REMOVIDO CHECKBOX DISPONIBILIDADE >>> */}
                 <div className={styles.formGroup}>
                    <label htmlFor="tipo-transp-imagem" className={styles.label}>Imagem (Opcional):</label>
                     <input type="file" id="tipo-transp-imagem" onChange={handleFileChange} accept="image/*" className={styles.inputFile} disabled={isUploading}/>
                     {isUploading && <p>Enviando...</p>}
                     {previewImagem && !isUploading && ( <div className={styles.imagemPreviewContainer}> {/* ... preview ... */} </div> )}
                 </div>
                 <div className={styles.buttonGroup}>
                    <button type="submit" className={styles.saveButton} disabled={isLoading || isUploading}>{isLoading ? 'Salvando...' : 'Salvar Tipo'}</button>
                    <button type="button" onClick={onCancelar} className={styles.cancelButton} disabled={isLoading || isUploading}>Cancelar</button>
                </div>
            </form>
        </div>
    );
}

export default FormularioTransporte;