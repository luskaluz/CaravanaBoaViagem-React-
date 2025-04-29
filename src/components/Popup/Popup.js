// src/components/Popup/Popup.js
import React, { useState, useEffect } from "react";
import * as api from '../../services/api';
import { auth } from "../../services/firebase";
import styles from "./Popup.module.css";
import translateStatus from "../translate/translate"; 

function PopupConfira({ caravana: initialCaravana, onClose, onCompraSucesso, localidade, isLocalidade }) {

    const [imagens, setImagens] = useState([]);
    const [indiceImagem, setIndiceImagem] = useState(0);
    const [caravanaLocal, setCaravanaLocal] = useState(initialCaravana); 
    const [localidadeLocal, setLocalidadeLocal] = useState(localidade);

    const [quantidadeIngressos, setQuantidadeIngressos] = useState(1);
    const [error, setError] = useState(null);
    const [comprando, setComprando] = useState(false); 
    useEffect(() => {
        if (isLocalidade && localidade) {
            setLocalidadeLocal(localidade);
            setImagens(localidade.imagens || []);
            setIndiceImagem(0);
        } else if (initialCaravana) {
            setCaravanaLocal(initialCaravana);
            const imagensParaNavegar = initialCaravana.imagensLocalidade && initialCaravana.imagensLocalidade.length > 0
                ? initialCaravana.imagensLocalidade
                : (initialCaravana.imagemCapaLocalidade ? [initialCaravana.imagemCapaLocalidade] : []);
            setImagens(imagensParaNavegar);
            setIndiceImagem(0);
        }
         setQuantidadeIngressos(1);
         setError(null);
    }, [initialCaravana, localidade, isLocalidade]);
    const handleNavegarImagem = (direcao) => {
        if (!imagens || imagens.length <= 1) return;
        let novoIndice;
        if (direcao === "anterior") {
            novoIndice = indiceImagem - 1 < 0 ? imagens.length - 1 : indiceImagem - 1;
        } else {
            novoIndice = (indiceImagem + 1) % imagens.length;
        }
        setIndiceImagem(novoIndice);
    };
    const handleComprarIngresso = async () => {
        const user = auth.currentUser;
        if (!user) {
            alert("Você precisa estar logado para comprar ingressos.");
            return;
        }
        if (quantidadeIngressos < 1) {
            alert("A quantidade de ingressos deve ser pelo menos 1.");
            return;
        }
        if (!caravanaLocal || caravanaLocal.vagasDisponiveis < quantidadeIngressos) {
             const vagasMsg = caravanaLocal ? caravanaLocal.vagasDisponiveis : 'N/A';
            alert(`Não há ingressos suficientes. Disponíveis: ${vagasMsg}`);
            return;
        }
         if (caravanaLocal.status === 'cancelada') {
             alert("Não é possível comprar ingressos para uma caravana cancelada.");
            return;
         }


        setComprando(true);
        setError(null);

        try {
            await api.comprarIngresso(
                caravanaLocal.id,
                user.uid,
                user.email,
                quantidadeIngressos
            );
            const caravanaAtualizada = await api.getCaravanaById(caravanaLocal.id);
            setCaravanaLocal(caravanaAtualizada);
            setQuantidadeIngressos(1);

            if (onCompraSucesso) {
                onCompraSucesso(caravanaAtualizada); 
            } else {
                 alert("Ingresso(s) comprado(s) com sucesso!");
            }

        } catch (error) {
            console.error("Erro ao comprar ingresso (Popup):", error);
            setError(error.message); 
            alert("Erro ao comprar ingresso: " + error.message); 
        } finally {
            setComprando(false); 
        }
    };
    if (isLocalidade && localidadeLocal) {
        const imagemPrincipalLocalidade = localidadeLocal.imagens?.[indiceImagem] || "./images/imagem_padrao.jpg";
        return (
            <div className={styles.popup}>
                <div className={styles.popupContent}>
                    <div className={styles.popupImagens}>
                        <div className={styles.imagemContainer}>
                            <img
                                src={imagemPrincipalLocalidade}
                                alt={localidadeLocal.nome}
                                className={styles.popupImagemPrincipal}
                            />
                            {localidadeLocal.imagens && localidadeLocal.imagens.length > 1 && (
                                <>
                                    <button className={`${styles.popupNavegacao} ${styles.anterior}`} onClick={() => handleNavegarImagem("anterior")}>❮</button>
                                    <button className={`${styles.popupNavegacao} ${styles.proximo}`} onClick={() => handleNavegarImagem("proximo")}>❯</button>
                                </>
                            )}
                        </div>
                    </div>
                    <div className={styles.popupInfo}>
                        <h2 className={styles.popupNome}>{localidadeLocal.nome}</h2>
                        <p className={styles.popupDescricao}>{localidadeLocal.descricao || "Descrição não disponível."}</p>
                        <div className={styles.popupBotoes}>
                            <button onClick={onClose}>Fechar</button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }
    if (!isLocalidade && caravanaLocal) {
        const imagemPrincipalCaravana = imagens[indiceImagem] || "./images/imagem_padrao.jpg";
        return (
            <div className={styles.popup}>
                <div className={styles.popupContent}>
                    <div className={styles.popupImagens}>
                        <div className={styles.imagemContainer}>
                            <img
                                src={imagemPrincipalCaravana}
                                alt={caravanaLocal.nomeLocalidade}
                                className={styles.popupImagemPrincipal}
                            />
                            {imagens.length > 1 && (
                                <>
                                    <button className={`${styles.popupNavegacao} ${styles.anterior}`} onClick={() => handleNavegarImagem("anterior")}>❮</button>
                                    <button className={`${styles.popupNavegacao} ${styles.proximo}`} onClick={() => handleNavegarImagem("proximo")}>❯</button>
                                </>
                            )}
                        </div>
                    </div>
                    <div className={styles.popupInfo}>
                        <h2 className={styles.popupNome}>{caravanaLocal.nomeLocalidade || 'Destino Indefinido'}</h2>
                        <p className={styles.popupDescricao}>{caravanaLocal.descricaoLocalidade || 'Descrição não disponível.'}</p>
                        <p className={styles.info}><strong>Status:</strong> {translateStatus(caravanaLocal.status)}</p>
                        <p><strong>Data:</strong> {caravanaLocal.data ? new Date(caravanaLocal.data).toLocaleDateString() : "N/A"}</p>
                        <p><strong>Horário de Saída:</strong> {caravanaLocal.horarioSaida || "N/A"}</p>
                        <p><strong>Vagas Totais:</strong> {caravanaLocal.vagasTotais || "N/A"}</p>
                        <p><strong>Vagas Disponíveis:</strong>{" "}
                            <span className={caravanaLocal.vagasDisponiveis === 0 ? styles.semVagas : ""}>
                                {caravanaLocal.vagasDisponiveis === 0 ? "Esgotado" : caravanaLocal.vagasDisponiveis}
                            </span>
                        </p>
                        {error && <p className={styles.errorPopup}>{error}</p>}
                        {caravanaLocal.vagasDisponiveis > 0 && caravanaLocal.status !== 'cancelada' && (
                            <div className={styles.comprarIngressos}>
                                <label htmlFor={`quantidade-ingressos-${caravanaLocal.id}`}>Comprar ingressos:</label>
                                <input
                                    type="number"
                                    id={`quantidade-ingressos-${caravanaLocal.id}`} 
                                    placeholder="Quantidade"
                                    min="1"
                                    max={caravanaLocal.vagasDisponiveis} 
                                    value={quantidadeIngressos}
                                    onChange={(e) => {
                                        let qtd = parseInt(e.target.value, 10) || 1;
                                        if (qtd < 1) qtd = 1;
                                        if (caravanaLocal && qtd > caravanaLocal.vagasDisponiveis) {
                                             qtd = caravanaLocal.vagasDisponiveis;
                                        }
                                        setQuantidadeIngressos(qtd);
                                    }}
                                    disabled={comprando}
                                />
                            </div>
                        )}
                        <div className={styles.popupBotoes}>
                            {caravanaLocal.vagasDisponiveis > 0 && caravanaLocal.status !== 'cancelada' && (
                                <button onClick={handleComprarIngresso} className={styles.botaoComprar} disabled={comprando}>
                                    {comprando ? "Comprando..." : "Comprar"}
                                </button>
                            )}
                            <button onClick={onClose} disabled={comprando}>Fechar</button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }
    return null;
}

export default PopupConfira;