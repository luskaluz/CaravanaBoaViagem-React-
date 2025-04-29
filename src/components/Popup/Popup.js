import React, { useState, useEffect, useMemo } from "react";
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
            setCaravanaLocal(null);
        } else if (initialCaravana) {
            setCaravanaLocal(initialCaravana);
            const imagensParaNavegar = initialCaravana.imagensLocalidade?.length > 0
                ? initialCaravana.imagensLocalidade
                : (initialCaravana.imagemCapaLocalidade ? [initialCaravana.imagemCapaLocalidade] : []);
            setImagens(imagensParaNavegar);
            setIndiceImagem(0);
            setLocalidadeLocal(null);
        }
         setQuantidadeIngressos(1);
         setError(null);
    }, [initialCaravana, localidade, isLocalidade]);

    const handleNavegarImagem = (direcao) => {
        if (!imagens || imagens.length <= 1) return;
        let novoIndice = direcao === "anterior" ? (indiceImagem - 1 + imagens.length) % imagens.length : (indiceImagem + 1) % imagens.length;
        setIndiceImagem(novoIndice);
    };

    const handleComprarIngresso = async () => {
        const user = auth.currentUser;
        if (!user) { alert("Login necessário."); return; }
        if (quantidadeIngressos < 1) { alert("Quantidade deve ser >= 1."); return; }
        if (!caravanaLocal) { alert("Erro: Caravana inválida."); return; }
        if (caravanaLocal.status === 'cancelada') { alert("Caravana cancelada."); return; }

        setComprando(true); setError(null);
        try {
            await api.comprarIngresso(caravanaLocal.id, quantidadeIngressos);
            setQuantidadeIngressos(1);
            if (onCompraSucesso) onCompraSucesso(caravanaLocal.id);
            alert("Ingresso(s) comprado(s) com sucesso!");
            onClose();
        } catch (error) { console.error("Erro Compra Popup:", error); setError(error.message); alert("Erro: " + error.message); }
        finally { setComprando(false); }
    };

    const disponibilidadeCalculada = useMemo(() => {
        if (!caravanaLocal) return { vagas: 0, capacidade: 0 };
        const capacidadeMax = caravanaLocal.transporteConfirmado
            ? (caravanaLocal.transportesAlocados?.[0]?.assentos || 0)
            : (caravanaLocal.maxCapacidadeDisponivel || 0); // Usa o campo que veio da API/pai
        const vagasOcup = (caravanaLocal.vagasOcupadas || ((caravanaLocal.vagasTotais || 0) - (caravanaLocal.vagasDisponiveis ?? (caravanaLocal.vagasTotais || 0)))) + (caravanaLocal.administradorUid ? 1 : 0);
        const vagasDisp = Math.max(0, capacidadeMax - vagasOcup);
        return { vagas: vagasDisp, capacidade: capacidadeMax };
    }, [caravanaLocal]);

    if (isLocalidade && localidadeLocal) {
        const imagemPrincipalLocalidade = imagens[indiceImagem] || "./images/imagem_padrao.jpg";
        return (
            <div className={styles.popup}>
                <div className={styles.popupContent}>
                    <button onClick={onClose} className={styles.popupCloseButton}>×</button>
                    <div className={styles.popupImagens}>
                        <div className={styles.imagemContainer}>
                            <img src={imagemPrincipalLocalidade} alt={localidadeLocal.nome} className={styles.popupImagemPrincipal}/>
                            {imagens.length > 1 && (<>
                                <button className={`${styles.popupNavegacao} ${styles.anterior}`} onClick={() => handleNavegarImagem("anterior")}>❮</button>
                                <button className={`${styles.popupNavegacao} ${styles.proximo}`} onClick={() => handleNavegarImagem("proximo")}>❯</button>
                            </>)}
                        </div>
                    </div>
                    <div className={styles.popupInfo}>
                        <h2 className={styles.popupNome}>{localidadeLocal.nome}</h2>
                        <p className={styles.popupDescricao}>{localidadeLocal.descricao || "Sem descrição."}</p>
                        <div className={styles.popupBotoes}><button onClick={onClose}>Fechar</button></div>
                    </div>
                </div>
            </div>
        );
    }

    if (!isLocalidade && caravanaLocal) {
        const imagemPrincipalCaravana = imagens[indiceImagem] || "./images/imagem_padrao.jpg";
        const podeComprar = disponibilidadeCalculada.vagas > 0 && caravanaLocal.status !== 'cancelada';

        return (
            <div className={styles.popup}>
                <div className={styles.popupContent}>
                    <button onClick={onClose} className={styles.popupCloseButton}>×</button>
                    <div className={styles.popupImagens}>
                        <div className={styles.imagemContainer}>
                            <img src={imagemPrincipalCaravana} alt={caravanaLocal.nomeLocalidade} className={styles.popupImagemPrincipal}/>
                            {imagens.length > 1 && (<>
                                <button className={`${styles.popupNavegacao} ${styles.anterior}`} onClick={() => handleNavegarImagem("anterior")}>❮</button>
                                <button className={`${styles.popupNavegacao} ${styles.proximo}`} onClick={() => handleNavegarImagem("proximo")}>❯</button>
                            </>)}
                        </div>
                    </div>
                    <div className={styles.popupInfo}>
                        <h2 className={styles.popupNome}>{caravanaLocal.nomeLocalidade || 'Indefinido'}</h2>
                        <p className={styles.popupDescricao}>{caravanaLocal.descricaoLocalidade || 'Sem descrição.'}</p>
                        <p className={styles.info}><strong>Status:</strong> {translateStatus(caravanaLocal.status)}</p>
                        <p><strong>Data:</strong> {caravanaLocal.data ? new Date(caravanaLocal.data + 'T00:00:00').toLocaleDateString() : "N/A"}</p>
                        <p><strong>Horário Saída:</strong> {caravanaLocal.horarioSaida || "N/A"}</p>
                        <p><strong>Capacidade {caravanaLocal.transporteConfirmado ? '(Alocada):' : '(Máx. Prevista):'}</strong> {disponibilidadeCalculada.capacidade || 'N/A'}</p>
                        <p><strong>Vagas Disponíveis:</strong>{" "}
                            <span className={disponibilidadeCalculada.vagas === 0 ? styles.semVagas : ""}>
                                {disponibilidadeCalculada.vagas === 0 ? "Esgotado" : disponibilidadeCalculada.vagas}
                            </span>
                        </p>
                        {error && <p className={styles.errorPopup}>{error}</p>}
                        {podeComprar && (
                             <div className={styles.comprarIngressos}>
                                <label htmlFor={`qnt-${caravanaLocal.id}`}>Comprar:</label>
                                <input
                                    type="number" id={`qnt-${caravanaLocal.id}`}
                                    min="1" max={disponibilidadeCalculada.vagas}
                                    value={quantidadeIngressos}
                                    onChange={(e) => {
                                        let qtd = parseInt(e.target.value, 10) || 1;
                                        if (qtd < 1) qtd = 1;
                                        if (qtd > disponibilidadeCalculada.vagas) qtd = disponibilidadeCalculada.vagas;
                                        setQuantidadeIngressos(qtd);
                                    }}
                                    disabled={comprando}
                                />
                                <span> ingresso(s)</span>
                            </div>
                        )}
                        <div className={styles.popupBotoes}>
                            {podeComprar && (
                                <button onClick={handleComprarIngresso} className={styles.botaoComprar} disabled={comprando}>
                                    {comprando ? "Processando..." : "Comprar"}
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