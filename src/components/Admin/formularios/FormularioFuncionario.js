import React, { useState, useEffect } from 'react';
import * as api from '../../../services/api';
import styles from './FormularioFuncionario.module.css';
import { uploadImage } from '../../../services/cloudinary';

function FormularioFuncionario({ funcionario, onSalvar, onCancelar }) {
    const [formData, setFormData] = useState({
        nome: '',
        email: '',
        telefone: '',
        senha: '',
        cargo: 'motorista',
        salario: '',
    });
    const [fotoUrl, setFotoUrl] = useState(null);
    const [arquivoFoto, setArquivoFoto] = useState(null);
    const [previewFoto, setPreviewFoto] = useState(null);
    const [isEditMode, setIsEditMode] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (funcionario) {
            setIsEditMode(true);
            setFormData({
                nome: funcionario.nome || '',
                email: funcionario.email || '',
                telefone: funcionario.telefone || '',
                senha: '',
                cargo: funcionario.cargo || 'motorista',
                salario: funcionario.salario ? String(funcionario.salario) : '',
            });
            setFotoUrl(funcionario.fotoUrl || null);
            setPreviewFoto(funcionario.fotoUrl || null);
            setArquivoFoto(null);
        } else {
            setIsEditMode(false);
            setFormData({
                nome: '', email: '', telefone: '', senha: '',
                cargo: 'motorista', salario: '',
            });
            setFotoUrl(null);
            setArquivoFoto(null);
            setPreviewFoto(null);
        }
        setError(null);
    }, [funcionario]);

    useEffect(() => {
        if (!arquivoFoto) {
            setPreviewFoto(fotoUrl);
            return;
        }
        const objectUrl = URL.createObjectURL(arquivoFoto);
        setPreviewFoto(objectUrl);
        return () => URL.revokeObjectURL(objectUrl);
    }, [arquivoFoto, fotoUrl]);


    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prevData => ({
            ...prevData,
            [name]: value
        }));
    };

    const handleFotoChange = (event) => {
        setError(null);
        const file = event.target.files[0];
        if (file && file.type.startsWith('image/')) {
            setArquivoFoto(file);
        } else {
            setArquivoFoto(null);
            if (file) {
                 setError('Por favor, selecione um arquivo de imagem válido.');
            }
            event.target.value = null;
        }
    };

     const handleRemoverFoto = () => {
        setArquivoFoto(null);
        setFotoUrl(null);
        setPreviewFoto(null);
        const fileInput = document.getElementById('foto-func');
        if(fileInput) fileInput.value = null;
     };


    const handleSubmit = async (event) => {
        event.preventDefault();
        setError(null);

        if (!formData.nome || !formData.email || !formData.telefone || !formData.salario || (!isEditMode && !formData.senha)) {
             setError("Nome, Email, Telefone e Salário são obrigatórios. Senha é obrigatória na criação.");
             return;
        }
        if (!isEditMode && formData.senha.length < 6) {
            setError("A senha deve ter no mínimo 6 caracteres.");
            return;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
            setError("Formato de email inválido.");
            return;
        }
        const phoneRegex = /^(?:\(?\d{2}\)?\s?)?(?:9?\d{4}[-.\s]?\d{4})$/;
        if (!phoneRegex.test(formData.telefone)) {
            setError("Formato de telefone inválido.");
             return;
        }
        if (isNaN(parseFloat(formData.salario)) || parseFloat(formData.salario) < 0) {
             setError("Salário inválido.");
             return;
        }

        setIsLoading(true);

        let uploadedFotoUrl = fotoUrl;

        if (arquivoFoto) {
             try {
                const url = await uploadImage(arquivoFoto);
                 if (url) {
                    uploadedFotoUrl = url;
                 } else {
                     throw new Error('Falha no upload da imagem.');
                 }
             } catch (uploadError) {
                 setError(`Erro no upload da foto: ${uploadError.message}`);
                 setIsLoading(false);
                 return;
             }
        } else if (!fotoUrl) {
             uploadedFotoUrl = null;
        }


        const funcionarioData = {
            nome: formData.nome,
            email: formData.email,
            telefone: formData.telefone,
            cargo: formData.cargo,
            salario: parseFloat(formData.salario),
            fotoUrl: uploadedFotoUrl,
            ...(!isEditMode && { senha: formData.senha }),
        };

        try {
            if (isEditMode) {
                await api.updateFuncionario(funcionario.id, funcionarioData);
            } else {
                await api.createFuncionario(funcionarioData);
            }
            onSalvar();

        } catch (error) {
            console.error('Erro ao salvar funcionário:', error);
            setError(error.message || `Erro ao ${isEditMode ? 'atualizar' : 'criar'} funcionário.`);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className={styles.container}>
            <h2 className={styles.title}>{isEditMode ? "Editar Funcionário" : "Criar Funcionário"}</h2>
            {error && <div className={styles.error}>{error}</div>}
            <form onSubmit={handleSubmit} className={styles.form}>
                <div className={styles.formGroup}>
                    <label htmlFor="nome-func" className={styles.label}>Nome:</label>
                    <input type="text" id="nome-func" name="nome" value={formData.nome} onChange={handleChange} required className={styles.input}/>
                </div>
                <div className={styles.formGroup}>
                    <label htmlFor="email-func" className={styles.label}>Email:</label>
                    <input type="email" id="email-func" name="email" value={formData.email} onChange={handleChange} required className={styles.input} />
                </div>
                 <div className={styles.formGroup}>
                    <label htmlFor="telefone-func" className={styles.label}>Telefone:</label>
                    <input type="tel" id="telefone-func" name="telefone" value={formData.telefone} onChange={handleChange} required className={styles.input}/>
                </div>
                {!isEditMode && (
                    <div className={styles.formGroup}>
                        <label htmlFor="senha-func" className={styles.label}>Senha:</label>
                        <input type="password" id="senha-func" name="senha" value={formData.senha} onChange={handleChange} required minLength="6" className={styles.input}/>
                    </div>
                )}
                 <div className={styles.formGroup}>
                    <label htmlFor="cargo-func" className={styles.label}>Cargo:</label>
                    <select id="cargo-func" name="cargo" value={formData.cargo} onChange={handleChange} className={styles.input}>
                        <option value="motorista">Motorista</option>
                        <option value="administrador">Administrador</option>
                        <option value="guia">Guia</option>
                    </select>
                </div>
                <div className={styles.formGroup}>
                    <label htmlFor="salario-func" className={styles.label}>Salário (R$):</label>
                    <input type="number" id="salario-func" name="salario" value={formData.salario} onChange={handleChange} step="0.01" min="0" required className={styles.input}/>
                </div>

                 <div className={styles.formGroup}>
                   <label htmlFor="foto-func" className={styles.label}>Foto:</label>
                   <input
                        type="file"
                        id="foto-func"
                        onChange={handleFotoChange}
                        accept="image/*"
                        className={styles.inputFile}
                    />
                    {previewFoto && (
                         <div className={styles.imagemPreviewContainer}>
                              <img src={previewFoto} alt="Preview" className={styles.imagemPreview} />
                              <button
                                  type="button"
                                  onClick={handleRemoverFoto}
                                  className={styles.removeImageButton}
                              >
                                  Remover Foto
                              </button>
                         </div>
                    )}
                 </div>

                <div className={styles.buttonGroup}>
                    <button type="submit" className={styles.saveButton} disabled={isLoading}>
                        {isLoading ? 'Salvando...' : (isEditMode ? "Salvar Alterações" : "Criar Funcionário")}
                    </button>
                    <button type="button" onClick={onCancelar} className={styles.cancelButton} disabled={isLoading}>
                        Cancelar
                    </button>
                </div>
            </form>
        </div>
    );
}

export default FormularioFuncionario;