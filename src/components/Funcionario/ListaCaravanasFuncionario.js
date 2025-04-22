import React from 'react';
import styles from './ListaCaravanasFuncionario.module.css';


function ListaCaravanasFuncionario({ caravanas, onCaravanaClick, onParticipantesClick }) {


    const handleVerParticipantes = (event, caravanaId) => {
        event.stopPropagation(); 
        onParticipantesClick(caravanaId);

    };

    return (
        <div className={styles.cardContainer}>
            {caravanas.length === 0 ? (
                <div className={styles.containerMensagem}>
                    <p>Você não possui caravanas no momento</p>
                </div>
            ) : (
                caravanas.map((caravana) => {
                    const hoje = new Date();
                    const dataCaravana = new Date(caravana.data);
                    const isPast = dataCaravana < hoje;
                    const isCancelled = caravana.status === 'cancelada';


                    const cardClass = `${styles.card} ${isPast || isCancelled ? styles.caravanaInativa : ''
                        }`;

                    return (
                        <div key={caravana.id} className={cardClass} >
                            <img
                                src={caravana.imagensLocalidade ? caravana.imagensLocalidade[0] : ''}
                                alt={caravana.nomeLocalidade}
                                className={styles.image}
                            />
                            <h3 className={styles.cardTitle}>{caravana.nomeLocalidade}</h3>
                            <p className={styles.cardDate}>
                                Data: {new Date(caravana.data).toLocaleDateString()}
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

                            <button
                                className={styles.participantesButton}
                                onClick={(event) => handleVerParticipantes(event, caravana.id)}
                            >
                                Ver Participantes
                            </button>
                        </div>
                    );
                }))}
        </div>
    );
}

export default ListaCaravanasFuncionario;
