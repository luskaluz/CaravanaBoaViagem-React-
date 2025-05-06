import React from 'react';
import styles from './ListaCaravanasFuncionario.module.css';

function ListaCaravanasFuncionario({ caravanas, onCaravanaClick, onParticipantesClick, funcionarioLogado }) {

    const handleVerParticipantesClick = (event, caravanaId) => {
        event.stopPropagation();
        if (onParticipantesClick) {
            onParticipantesClick(caravanaId);
        } else {
            console.error("onParticipantesClick não fornecido para ListaCaravanasFuncionario");
        }
    };

    return (
        <div className={styles.cardContainer}>
            {caravanas.length === 0 ? (
                <div className={styles.containerMensagem}>
                    <p>Você não está atribuído a nenhuma caravana que corresponda aos filtros atuais.</p>
                </div>
            ) : (
                caravanas.map((caravana) => {
                    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
                    const dataCaravana = new Date(caravana.data + 'T00:00:00Z');
                    const isPast = dataCaravana < hoje;
                    const isCancelled = caravana.status === 'cancelada';
                    const isConcluida = caravana.status === 'concluida';
                    const cardClass = `${styles.card} ${isPast || isCancelled || isConcluida ? styles.caravanaInativa : ''}`;

                    // Funcionário pode ver participantes se o transporte estiver definido
                    const podeVerParticipantes = (caravana.transporteDefinidoManualmente || caravana.transporteAutoDefinido);

                    return (
                        <div key={caravana.id} className={cardClass} >
                            <img
                                src={caravana.imagemCapaLocalidade || caravana.imagensLocalidade?.[0] || './images/imagem_padrao.jpg'}
                                alt={caravana.nomeLocalidade || 'Caravana'}
                                className={styles.image}
                                onError={(e) => {e.target.onerror = null; e.target.src = './images/imagem_padrao.jpg'}}
                            />
                            <h3 className={styles.cardTitle}>{caravana.nomeLocalidade || 'Destino Indefinido'}</h3>
                            <p className={styles.cardDate}>
                                Data: {new Date(caravana.data + 'T00:00:00Z').toLocaleDateString('pt-BR', {timeZone: 'UTC'})}
                            </p>
                            <p className={styles.cardTime}>
                                Horário de Saída: {caravana.horarioSaida || 'A definir'}
                            </p>

                            <button
                                className={styles.detailsButton}
                                onClick={() => onCaravanaClick(caravana)}
                            >
                                Ver Detalhes
                            </button>

                            {podeVerParticipantes && (
                                <button
                                    className={styles.participantesButton}
                                    onClick={(event) => handleVerParticipantesClick(event, caravana.id)}
                                >
                                    Ver Participantes
                                </button>
                            )}
                        </div>
                    );
                }))}
        </div>
    );
}

export default ListaCaravanasFuncionario;