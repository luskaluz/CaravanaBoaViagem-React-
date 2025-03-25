// src/components/Popup/Popup.js
import React, { useState, useEffect } from "react";
import * as api from '../../services/api';
import { auth } from "../../services/firebase";
import styles from "./Popup.module.css";
import translateStatus from "../translate/translate"

function PopupConfira({ caravana: initialCaravana, onClose, localidade, isLocalidade }) {
    const [imagens, setImagens] = useState([]);
    const [indiceImagem, setIndiceImagem] = useState(0);
    const [quantidadeIngressos, setQuantidadeIngressos] = useState(1);
    const [caravana, setCaravana] = useState(initialCaravana);
    const [error, setError] = useState(null);


    useEffect(() => {
        const loadCaravana = async () => {
            try {

                if (initialCaravana) {
                    setImagens(initialCaravana.imagensLocalidade || []);
                    setIndiceImagem(0);
                    setCaravana(initialCaravana)
                }

            } catch (error) {
                setError(error.message);
            }
        };

        loadCaravana();
    }, [initialCaravana]);


    const handleNavegarImagem = (direcao) => {
        if (direcao === "anterior") {
            setIndiceImagem((prevIndice) =>
                prevIndice - 1 < 0 ? imagens.length - 1 : prevIndice - 1
            );
        } else {
            setIndiceImagem((prevIndice) => (prevIndice + 1) % imagens.length);
        }
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

        try {
            console.log("caravana.id:", caravana.id);
            console.log("user.uid:", user.uid);
            console.log("user.email:", user.email);
            console.log("quantidadeIngressos:", quantidadeIngressos);
            await api.comprarIngresso(caravana.id, user.uid, user.email, quantidadeIngressos);
            // alert(`Ingresso(s) comprado(s) com sucesso!  Quantidade: ${quantidadeIngressos}`);
            const updatedCaravana = await api.getCaravana(caravana.id)
            setCaravana(updatedCaravana)
        } catch (error) {
            alert("Erro ao comprar ingresso: " + error.message);
        }
    };


    if (isLocalidade) {
        return (
            <div className={styles.popup}>
                <div className={styles.popupContent}>
                    <div className={styles.popupImagens}>
                        <div className={styles.imagemContainer}>
                            <img
                                src={localidade.imagens?.[0] || "./images/imagem_padrao.jpg"}
                                alt={localidade.nome}
                                className={styles.popupImagemPrincipal}
                            />
                            {localidade.imagens && localidade.imagens.length > 1 && (
                                <>
                                    <button
                                        className={`${styles.popupNavegacao} ${styles.anterior}`}
                                        onClick={() => handleNavegarImagem("anterior")}
                                    >
                                        &#10094;
                                    </button>
                                    <button
                                        className={`${styles.popupNavegacao} ${styles.proximo}`}
                                        onClick={() => handleNavegarImagem("proximo")}
                                    >
                                        &#10095;
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                    <div className={styles.popupInfo}>
                        <h2 className={styles.popupNome}>{localidade.nome}</h2>
                        <p className={styles.popupDescricao}>{localidade.descricao}</p>  
                        <div className={styles.popupBotoes}>
                            <button onClick={onClose}>Fechar</button> 
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (!caravana) {
        return null;
    }
    return (
        <div className={styles.popup}>
            <div className={styles.popupContent}>
                <div className={styles.popupImagens}>
                    <div className={styles.imagemContainer}>
                        <img
                            src={imagens[indiceImagem] || "./images/imagem_padrao.jpg"}
                            alt={caravana.nomeLocalidade}
                            className={styles.popupImagemPrincipal}
                        />

                        <button
                            className={`${styles.popupNavegacao} ${styles.anterior}`}
                            onClick={() => handleNavegarImagem("anterior")}
                        >
                            &#10094;
                        </button>
                        <button
                            className={`${styles.popupNavegacao} ${styles.proximo}`}
                            onClick={() => handleNavegarImagem("proximo")}
                        >
                            &#10095;
                        </button>
                    </div>
                </div>
                <div className={styles.popupInfo}>
                    <h2 className={styles.popupNome}>{caravana.nomeLocalidade}</h2>
                    <p className={styles.popupDescricao}>{caravana.descricaoLocalidade}</p>
                    <p className={styles.info}>
                            <strong>Status:</strong> {translateStatus(caravana.status)}
                    </p>
                    <p>
                        <strong>Data:</strong> {caravana.data ? new Date(caravana.data).toLocaleDateString() : "N/A"}
                    </p>
                    <p>
                        <strong>Horário de Saída:</strong> {caravana.horarioSaida || "N/A"}
                    </p>
                    <p>
                        <strong>Vagas Totais:</strong> {caravana.vagasTotais || "N/A"}
                    </p>
                    <p>
                        <strong>Vagas Disponíveis:</strong>{" "}
                        <span
                            className={
                                caravana.vagasDisponiveis === 0
                                    ? styles.semVagas
                                    : ""
                            }
                        >
                            {caravana.vagasDisponiveis === 0
                                ? "Esgotado"
                                : caravana.vagasDisponiveis
                            }
                        </span>
                    </p>

                    <div className={styles.comprarIngressos}>
                        <label htmlFor="quantidade-ingressos">Comprar ingressos:</label>
                        <input
                            type="number"
                            id="quantidade-ingressos"
                            placeholder="Quantidade"
                            min="1"
                            value={quantidadeIngressos}
                            onChange={(e) =>
                                setQuantidadeIngressos(parseInt(e.target.value, 10) || 1)
                            }
                        />
                    </div>
                    <div className={styles.popupBotoes}>
                        <button onClick={handleComprarIngresso} className={styles.botaoComprar}>Comprar</button>
                        <button onClick={onClose}>Fechar</button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default PopupConfira;
