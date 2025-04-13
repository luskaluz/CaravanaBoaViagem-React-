import React, { useState, useEffect } from "react";
import PropTypes from 'prop-types';
import * as api from '../../services/api';
import { auth } from "../../services/firebase";
import styles from "./Popup.module.css";
import translateStatus from "../translate/translate";

function PopupConfira({ caravana: initialCaravana, onClose, localidade, isLocalidade }) {
    const [imagens, setImagens] = useState([]);
    const [indiceImagem, setIndiceImagem] = useState(0);
    const [quantidadeIngressos, setQuantidadeIngressos] = useState(1);
    const [caravana, setCaravana] = useState(initialCaravana);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!initialCaravana && !isLocalidade) {
            onClose();
            return;
        }

        const loadCaravana = async () => {
            try {
                setLoading(true);
                if (initialCaravana) {
                    setImagens(initialCaravana.imagensLocalidade || []);
                    setCaravana(initialCaravana);
                }
            } catch (error) {
                setError(error.message);
                console.error("Erro ao carregar caravana:", error);
            } finally {
                setLoading(false);
            }
        };

        loadCaravana();
    }, [initialCaravana, isLocalidade, onClose]);

    const handleNavegarImagem = (direcao) => {
        if (imagens.length <= 1) return;

        setIndiceImagem(prevIndice =>
            direcao === "anterior"
                ? (prevIndice - 1 + imagens.length) % imagens.length
                : (prevIndice + 1) % imagens.length
        );
    };

    const handleComprarIngresso = async () => {
        if (!caravana || !caravana.id) {
            setError("Dados da caravana incompletos");
            return;
        }

        const user = auth.currentUser;
        if (!user) {
            alert("Você precisa estar logado para comprar ingressos.");
            return;
        }

        const vagasDisponiveis = caravana.vagasDisponiveis || 0;

        if (quantidadeIngressos < 1 || quantidadeIngressos > vagasDisponiveis) {
            alert(`Quantidade inválida. Digite um valor entre 1 e ${vagasDisponiveis}.`);
            return;
        }

        try {
            setLoading(true);
            await api.comprarIngresso(
                caravana.id,
                user.uid,
                user.email,
                Math.min(quantidadeIngressos, vagasDisponiveis)
            );

            const updatedCaravana = await api.getCaravana(caravana.id);
            setCaravana(updatedCaravana);
            setQuantidadeIngressos(1);
        } catch (error) {
            setError("Erro ao comprar ingresso: " + error.message);
        } finally {
            setLoading(false);
        }
    };

    if (isLocalidade) {
        const localidadeImagens = localidade?.imagens || [];
        const imagemPrincipal = localidadeImagens[0] || "./images/imagem_padrao.jpg";

        return (
            <div className={styles.popup}>
                <div className={styles.popupContent}>
                    <div className={styles.popupImagens}>
                        <div className={styles.imagemContainer}>
                            <img
                                src={imagemPrincipal}
                                alt={localidade?.nome || "Localidade"}
                                className={styles.popupImagemPrincipal}
                                onError={(e) => {
                                    e.target.src = "./images/imagem_padrao.jpg";
                                }}
                            />
                            {localidadeImagens.length > 1 && (
                                <>
                                    <button
                                        className={`${styles.popupNavegacao} ${styles.anterior}`}
                                        onClick={() => handleNavegarImagem("anterior")}
                                        aria-label="Imagem anterior"
                                    >
                                        &#10094;
                                    </button>
                                    <button
                                        className={`${styles.popupNavegacao} ${styles.proximo}`}
                                        onClick={() => handleNavegarImagem("proximo")}
                                        aria-label="Próxima imagem"
                                    >
                                        &#10095;
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                    <div className={styles.popupInfo}>
                        <h2 className={styles.popupNome}>{localidade?.nome || "Localidade"}</h2>
                        <p className={styles.popupDescricao}>{localidade?.descricao || "Descrição não disponível"}</p>
                        {error && <p className={styles.error}>{error}</p>}
                        <div className={styles.popupBotoes}>
                            <button onClick={onClose}>Fechar</button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (!caravana || loading) {
        return (
            <div className={styles.popup}>
                <div className={styles.popupContent}>
                    <p>Carregando...</p>
                </div>
            </div>
        );
    }

    const imagemPrincipal = imagens[indiceImagem] || "./images/imagem_padrao.jpg";
    const vagasDisponiveis = caravana.vagasDisponiveis || 0;

    return (
        <div className={styles.popup}>
            <div className={styles.popupContent}>
                <div className={styles.popupImagens}>
                    <div className={styles.imagemContainer}>
                        <img
                            src={imagemPrincipal}
                            alt={caravana.nomeLocalidade || "Caravana"}
                            className={styles.popupImagemPrincipal}
                            onError={(e) => {
                                e.target.src = "./images/imagem_padrao.jpg";
                            }}
                        />
                        {imagens.length > 1 && (
                            <>
                                <button
                                    className={`${styles.popupNavegacao} ${styles.anterior}`}
                                    onClick={() => handleNavegarImagem("anterior")}
                                    aria-label="Imagem anterior"
                                >
                                    &#10094;
                                </button>
                                <button
                                    className={`${styles.popupNavegacao} ${styles.proximo}`}
                                    onClick={() => handleNavegarImagem("proximo")}
                                    aria-label="Próxima imagem"
                                >
                                    &#10095;
                                </button>
                            </>
                        )}
                    </div>
                </div>
                <div className={styles.popupInfo}>
                    <h2 className={styles.popupNome}>{caravana.nomeLocalidade || "Caravana"}</h2>
                    <p className={styles.popupDescricao}>{caravana.descricaoLocalidade || "Descrição não disponível"}</p>

                    <div className={styles.infoGroup}>
                        <p className={styles.info}>
                            <strong>Status:</strong> {translateStatus(caravana.status)}
                        </p>
                        <p className={styles.info}>
                            <strong>Data:</strong> {caravana.data ? new Date(caravana.data).toLocaleDateString() : "N/A"}
                        </p>
                        <p className={styles.info}>
                            <strong>Horário de Saída:</strong> {caravana.horarioSaida || "N/A"}
                        </p>
                        <p className={styles.info}>
                            <strong>Vagas Totais:</strong> {caravana.vagasTotais || "N/A"}
                        </p>
                        <p className={styles.info}>
                            <strong>Vagas Disponíveis:</strong>{" "}
                            <span className={vagasDisponiveis === 0 ? styles.semVagas : styles.comVagas}>
                                {vagasDisponiveis === 0 ? "Esgotado" : vagasDisponiveis}
                            </span>
                        </p>
                    </div>

                    {vagasDisponiveis > 0 && (
                        <div className={styles.comprarIngressos}>
                            <label htmlFor="quantidade-ingressos">Comprar ingressos:</label>
                            <input
                                type="number"
                                id="quantidade-ingressos"
                                placeholder="Quantidade"
                                min="1"
                                max={vagasDisponiveis}
                                value={quantidadeIngressos}
                                onChange={(e) => {
                                    const value = parseInt(e.target.value, 10) || 1;
                                    setQuantidadeIngressos(Math.min(Math.max(value, 1), vagasDisponiveis));
                                }}
                                disabled={loading}
                            />
                        </div>
                    )}

                    <div className={styles.popupBotoes}>
                        {vagasDisponiveis > 0 && (
                            <button
                                onClick={handleComprarIngresso}
                                className={styles.botaoComprar}
                                disabled={loading}
                            >
                                {loading ? "Processando..." : "Comprar"}
                            </button>
                        )}
                        <button onClick={onClose} disabled={loading}>
                            Fechar
                        </button>
                    </div>

                    {error && <p className={styles.error}>{error}</p>}
                </div>
            </div>
        </div>
    );
}

PopupConfira.propTypes = {
    caravana: PropTypes.shape({
        id: PropTypes.string,
        nomeLocalidade: PropTypes.string,
        descricaoLocalidade: PropTypes.string,
        imagensLocalidade: PropTypes.arrayOf(PropTypes.string),
        status: PropTypes.string,
        data: PropTypes.oneOfType([PropTypes.string, PropTypes.instanceOf(Date)]),
        horarioSaida: PropTypes.string,
        vagasTotais: PropTypes.number,
        vagasDisponiveis: PropTypes.number
    }),
    onClose: PropTypes.func.isRequired,
    localidade: PropTypes.shape({
        nome: PropTypes.string,
        descricao: PropTypes.string,
        imagens: PropTypes.arrayOf(PropTypes.string)
    }),
    isLocalidade: PropTypes.bool
};

PopupConfira.defaultProps = {
    isLocalidade: false
};

export default PopupConfira;