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
        if (!user) { alert("É necessário fazer login para comprar."); return; }
        if (quantidadeIngressos < 1) { alert("A quantidade de ingressos deve ser de pelo menos 1."); return; }
        if (!caravanaLocal) { alert("Erro: Caravana não encontrada."); return; }
        if (caravanaLocal.status === 'cancelada') { alert("Esta caravana foi cancelada."); return; }

        setComprando(true); setError(null);
        try {
            await api.comprarIngresso(caravanaLocal.id, quantidadeIngressos);
            setQuantidadeIngressos(1);
            if (onCompraSucesso) onCompraSucesso(caravanaLocal.id);
            alert("Ingresso(s) comprado(s) com sucesso!");
            onClose();
        } catch (error) {
            console.error("Erro ao comprar ingresso (Popup):", error);
            setError(error.message || "Erro desconhecido ao tentar comprar.");
            alert("Erro ao comprar: " + (error.message || "Erro desconhecido."));
        } finally {
            setComprando(false);
        }
    };

    const disponibilidadeCalculada = useMemo(() => {
        if (!caravanaLocal) return { vagasCliente: 0, capacidadeTotalExibida: 0 };

        let capacidadeBase = 0;
        let numAdminsConsiderados = 0;
        const vagasOcup = caravanaLocal.vagasOcupadas || 0;
        const transporteDefinido = caravanaLocal.transporteDefinidoManualmente || caravanaLocal.transporteAutoDefinido;

        if (transporteDefinido) {
            capacidadeBase = caravanaLocal.capacidadeFinalizada || 0;
            if (capacidadeBase > 0 && Array.isArray(caravanaLocal.transportesFinalizados)) {
                numAdminsConsiderados = Math.min(capacidadeBase, caravanaLocal.transportesFinalizados.length);
            }
        } else {
            capacidadeBase = caravanaLocal.capacidadeMaximaTeorica || 0;
            if (capacidadeBase > 0) {
                numAdminsConsiderados = Math.min(capacidadeBase, caravanaLocal.maximoTransportes || 0);
            }
        }

        const vagasDispCliente = Math.max(0, capacidadeBase - vagasOcup - numAdminsConsiderados);

        return {
            vagasCliente: vagasDispCliente,
            capacidadeTotalExibida: capacidadeBase
        };
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
                        <p className={styles.popupDescricao}>{localidadeLocal.descricao || "Sem descrição disponível."}</p>
                        <div className={styles.popupBotoes}><button onClick={onClose}>Fechar</button></div>
                    </div>
                </div>
            </div>
        );
    }

    if (!isLocalidade && caravanaLocal) {
        const imagemPrincipalCaravana = imagens[indiceImagem] || "./images/imagem_padrao.jpg";
        const podeComprar = disponibilidadeCalculada.vagasCliente > 0 && caravanaLocal.status !== 'cancelada';

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
                        <h2 className={styles.popupNome}>{caravanaLocal.nomeLocalidade || 'Destino Indefinido'}</h2>
                        <p className={styles.popupDescricao}>{caravanaLocal.descricaoLocalidade || 'Sem descrição do local.'}</p>
                        <p className={styles.info}><strong>Status:</strong> {translateStatus(caravanaLocal.status)}</p>
                        <p><strong>Data:</strong> {caravanaLocal.data ? new Date(caravanaLocal.data + 'T00:00:00Z').toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : "N/A"}</p>
                        <p><strong>Horário Saída:</strong> {caravanaLocal.horarioSaida || "A definir"}</p>
                        <p><strong>Capacidade Total:</strong> {disponibilidadeCalculada.capacidadeTotalExibida > 0 ? disponibilidadeCalculada.capacidadeTotalExibida : 'A definir'}</p>
                        <p><strong>Vagas Disponíveis (Clientes):</strong>{" "}
                            <span className={disponibilidadeCalculada.vagasCliente === 0 ? styles.semVagas : ""}>
                                {disponibilidadeCalculada.capacidadeTotalExibida === 0 ? "A definir" : (disponibilidadeCalculada.vagasCliente === 0 ? "Esgotado" : disponibilidadeCalculada.vagasCliente)}
                            </span>
                        </p>
                        {error && <p className={styles.errorPopup}>{error}</p>}
                        {podeComprar && disponibilidadeCalculada.capacidadeTotalExibida > 0 && (
                             <div className={styles.comprarIngressos}>
                                <label htmlFor={`qnt-${caravanaLocal.id}`}>Comprar:</label>
                                <input
                                    type="number" id={`qnt-${caravanaLocal.id}`}
                                    min="1" max={disponibilidadeCalculada.vagasCliente}
                                    value={quantidadeIngressos}
                                    onChange={(e) => {
                                        let qtd = parseInt(e.target.value, 10) || 1;
                                        if (qtd < 1) qtd = 1;
                                        if (qtd > disponibilidadeCalculada.vagasCliente) qtd = disponibilidadeCalculada.vagasCliente;
                                        setQuantidadeIngressos(qtd);
                                    }}
                                    disabled={comprando}
                                />
                                <span> ingresso(s)</span>
                            </div>
                        )}
                        <div className={styles.popupBotoes}>
                            {podeComprar && disponibilidadeCalculada.capacidadeTotalExibida > 0 && (
                                <button onClick={handleComprarIngresso} className={styles.botaoComprar} disabled={comprando || disponibilidadeCalculada.vagasCliente === 0}>
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