import React, { useState, useEffect } from 'react';
import * as api from '../../../services/api';
import { uploadImage } from '../../../services/cloudinary';
import styles from './FormularioFuncionario.module.css';

function FormularioTransporte({ transporte, onSalvar, onCancelar }) {
    const [formData, setFormData] = useState({ nome: '', assentos: '', fornecedor: '', placa: ''}); // Removido qtd
    const [imagemUrl, setImagemUrl] = useState(null);
    const [arquivoImagem, setArquivoImagem] = useState(null);
    const [previewImagem, setPreviewImagem] = useState(null);
    const [isEditMode, setIsEditMode] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [isUploading, setIsUploading] = useState(false);
    // Novo estado para disponibilidade (apenas na edição)
    const [disponivel, setDisponivel] = useState(true);

    useEffect(() => {
        if (transporte) {
            setIsEditMode(true);
            setFormData({
                nome: transporte.nome || '',
                assentos: transporte.assentos || '',
                fornecedor: transporte.fornecedor || '',
                placa: transporte.placa || '',
            });
            setImagemUrl(transporte.imagemUrl || null);
            setPreviewImagem(transporte.imagemUrl || null);
            setDisponivel(transporte.disponivel !== undefined ? transporte.disponivel : true); // Define disponibilidade
            setArquivoImagem(null);
        } else {
            setIsEditMode(false);
            setFormData({ nome: '', assentos: '', fornecedor: '', placa: '' });
            setImagemUrl(null); setArquivoImagem(null); setPreviewImagem(null); setDisponivel(true); // Default disponível
        }
        setError(null);
    }, [transporte]);

    useEffect(() => {
        if (!arquivoImagem) { setPreviewImagem(imagemUrl); return; }
        const objectUrl = URL.createObjectURL(arquivoImagem);
        setPreviewImagem(objectUrl);
        return () => URL.revokeObjectURL(objectUrl);
    }, [arquivoImagem, imagemUrl]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleFileChange = (event) => {
        setError(null); const file = event.target.files[0];
        if (file && file.type.startsWith('image/')) { setArquivoImagem(file); }
        else { setArquivoImagem(null); if(file) setError('Imagem inválida.'); event.target.value = null; }
    };

     const handleRemoverImagem = () => {
        setArquivoImagem(null); setImagemUrl(null); setPreviewImagem(null);
        const fileInput = document.getElementById('transp-imagem');
        if (fileInput) fileInput.value = null;
     };

     const handleDisponibilidadeChange = (e) => {
         setDisponivel(e.target.checked);
     };

    const handleSubmit = async (e) => {
        e.preventDefault(); setError(null);
        const assentosNum = parseInt(formData.assentos, 10);

        if (!formData.nome || !formData.assentos || !formData.fornecedor || !formData.placa) {
            setError("Nome, Fornecedor, Placa e Assentos são obrigatórios."); return;
        }
        if (isNaN(assentosNum) || assentosNum <= 0) { setError("Assentos inválidos."); return; }

        setIsLoading(true);
        let finalImageUrl = imagemUrl;
        if (arquivoImagem) {
            setIsUploading(true);
            try {
                const uploadedUrl = await uploadImage(arquivoImagem);
                if (!uploadedUrl) throw new Error("Falha no upload.");
                finalImageUrl = uploadedUrl;
            } catch (uploadError) { setError(`Erro upload: ${uploadError.message}`); setIsLoading(false); setIsUploading(false); return; }
            finally { setIsUploading(false); }
        } else if (!imagemUrl && isEditMode) { finalImageUrl = null; }
          else if (!imagemUrl && !isEditMode) { finalImageUrl = null; }

        // Dados para criar/atualizar (sem custo/quantidade inicial)
        const dataToSend = {
            nome: formData.nome, assentos: assentosNum,
            imagemUrl: finalImageUrl, fornecedor: formData.fornecedor,
            placa: formData.placa,
            // Adiciona disponibilidade apenas na edição
            ...(isEditMode && { disponivel: disponivel })
        };

        try {
            if (isEditMode) { await api.updateTransporte(transporte.id, dataToSend); }
            else { await api.createTransporte(dataToSend); } // Backend inicializa disponivel=true
            onSalvar();
        } catch (err) { console.error(err); setError(err.message); }
        finally { setIsLoading(false); }
    };

    return (
        <div className={styles.container}>
            <h2 className={styles.title}>{isEditMode ? "Editar Transporte" : "Adicionar Veículo"}</h2>
            {error && <div className={styles.error}>{error}</div>}
            <form onSubmit={handleSubmit} className={styles.form}>
                 <div className={styles.formGroup}>
                    <label htmlFor="transp-nome" className={styles.label}>Nome/Identificação:</label>
                    <input type="text" id="transp-nome" name="nome" value={formData.nome} onChange={handleChange} required className={styles.input}/>
                 </div>
                 <div className={styles.formGroup}>
                    <label htmlFor="transp-fornecedor" className={styles.label}>Fornecedor:</label>
                    <input type="text" id="transp-fornecedor" name="fornecedor" value={formData.fornecedor} onChange={handleChange} required className={styles.input}/>
                 </div>
                 <div className={styles.formGroup}>
                    <label htmlFor="transp-placa" className={styles.label}>Placa:</label>
                    <input type="text" id="transp-placa" name="placa" value={formData.placa} onChange={handleChange} required className={styles.input}/>
                 </div>
                 <div className={styles.formGroup}>
                    <label htmlFor="transp-assentos" className={styles.label}>Nº de Assentos:</label>
                    <input type="number" id="transp-assentos" name="assentos" value={formData.assentos} onChange={handleChange} required min="1" className={styles.input}/>
                 </div>
                 {/* <<< CHECKBOX DE DISPONIBILIDADE (Só na Edição) >>> */}
                 {isEditMode && (
                     <div className={styles.formGroupCheck}>
                        <input type="checkbox" id="transp-disponivel" name="disponivel" checked={disponivel} onChange={handleDisponibilidadeChange} className={styles.checkbox}/>
                        <label htmlFor="transp-disponivel" className={styles.labelCheck}>Disponível para Alocação</label>
                    </div>
                 )}
                 <div className={styles.formGroup}>
                    <label htmlFor="transp-imagem" className={styles.label}>Imagem:</label>
                     <input type="file" id="transp-imagem" onChange={handleFileChange} accept="image/*" className={styles.inputFile} disabled={isUploading}/>
                     {isUploading && <p>Enviando...</p>}
                     {previewImagem && !isUploading && (
                         <div className={styles.imagemPreviewContainer}>
                              <img src={previewImagem} alt="Preview" className={styles.imagemPreview} />
                              <button type="button" onClick={handleRemoverImagem} className={styles.removeImageButton} disabled={isLoading}>Remover</button>
                         </div>
                    )}
                 </div>
                 <div className={styles.buttonGroup}>
                    <button type="submit" className={styles.saveButton} disabled={isLoading || isUploading}>{isLoading ? 'Salvando...' : 'Salvar'}</button>
                    <button type="button" onClick={onCancelar} className={styles.cancelButton} disabled={isLoading || isUploading}>Cancelar</button>
                </div>
            </form>
        </div>
    );
}

export default FormularioTransporte;