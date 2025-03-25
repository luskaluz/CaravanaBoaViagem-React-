// src/components/Admin/FormularioLocalidade.js
import React, { useState, useEffect } from 'react';
import * as api from '../../../services/api';
import styles from './FormularioLocalidade.module.css';
import { uploadImage } from '../../../services/cloudinary'; 

function FormularioLocalidade({ localidade, onSalvar, onCancelar }) {
    const [nome, setNome] = useState('');
    const [descricao, setDescricao] = useState('');
    const [imagens, setImagens] = useState([]);
    const [arquivos, setArquivos] = useState([]);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (localidade) {
            setNome(localidade.nome || '');
            setDescricao(localidade.descricao || '');
            setImagens(localidade.imagens || []);
        } else {
            setNome('');
            setDescricao('');
            setImagens([]);
        }
    }, [localidade]);

    const handleFileChange = (event) => {
      setError(null); 
      const files = Array.from(event.target.files); 
      if (files.some(file => !file.type.startsWith('image/'))) {
          setError('Por favor, selecione apenas arquivos de imagem.');
          return;
      }
        setArquivos(files);
    };

  const handleRemoverImagem = (index) => {
        const novasImagens = [...imagens];
       novasImagens.splice(index, 1); 
        setImagens(novasImagens);
    };

    const handleSubmit = async (event) => {
      event.preventDefault();

      if (!nome) {
          setError('O nome é obrigatório.');
          return;
      }
      try {
            setError(null);


            const uploadedImageUrls = [];
          for (const file of arquivos) {
            const url = await uploadImage(file); 
              if(url){
                uploadedImageUrls.push(url);
              } else {
              setError('Erro ao fazer upload de uma ou mais imagens.');
               return; 
            }
          }


           const allImageUrls = [...imagens, ...uploadedImageUrls];

          const localidadeData = { nome, descricao, imagens: allImageUrls };

          if (localidade) {
            await api.updateLocalidade(localidade.id, localidadeData); 
            alert('Localidade atualizada com sucesso!');

            } else {
              await api.createLocalidade(localidadeData);
                alert('Localidade criada com sucesso!');

            }
                 

        } catch (error) {
           setError(error.message);
            console.error('Erro:', error);

        }
    };

    return (
      <div className={styles.container}>
           <h2 className={styles.title}>{localidade ? "Editar Localidade" : "Criar Localidade"}</h2>
          {error && <div className={styles.error}>{error}</div>}
          <form onSubmit={handleSubmit} className={styles.form}>
              <div className={styles.formGroup}>
                  <label htmlFor="nome" className={styles.label}>Nome:</label>
                  <input
                      type="text"
                      id="nome"
                      value={nome}
                      onChange={(e) => setNome(e.target.value)}
                      className={styles.input}
                  />
              </div>

              <div className={styles.formGroup}>
                  <label htmlFor="descricao" className={styles.label}>Descrição:</label>
                  <textarea
                      id="descricao"
                      value={descricao}
                      onChange={(e) => setDescricao(e.target.value)}
                      className={styles.textarea}
                  />
              </div>

              <div className={styles.formGroup}>
                   <label htmlFor="imagens" className={styles.label}>Imagens:</label>
                  <div className={styles.imagensContainer}>

                      <input
                          type="file"
                          id="imagens"
                          multiple
                          onChange={handleFileChange}
                          accept="image/*"
                          className={styles.inputFile}
                      />
                    <div className={styles.imagensLista}>
                      {imagens.map((url, index) => (
                          <div key={index} className={styles.imagemItem}>
                              <img src={url} alt={`Imagem ${index + 1}`} className={styles.miniatura} />
                              <button
                                  type="button"
                                  onClick={() => handleRemoverImagem(index)}
                                  className={styles.removeImageButton}
                              >
                                  Remover
                              </button>
                          </div>
                      ))}
                      </div>
                  </div>
              </div>

              <div className={styles.buttonGroup}>
                  <button type="submit" className={styles.saveButton}>Salvar</button>
                
              </div>
          </form>
      </div>

    );
}

export default FormularioLocalidade;
