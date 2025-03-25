// src/components/Usuario/ListaCaravanasUsuario.js
import React, { useState } from 'react';
import styles from './ListaCaravanaUsuario.module.css';
import ModalDetalhesCaravanaUsuario from './ModalDetalhesCaravanaUsuario';
import CaravanaCard from '../CaravanaCard/CaravanaCard';


function ListaCaravanasUsuario({ caravanas }) { // Recebe 'caravanas' como prop (já filtradas)
    const [selectedCaravana, setSelectedCaravana] = useState(null);

    const openModal = (caravana) => {
        setSelectedCaravana(caravana);
    };

    const closeModal = () => {
        setSelectedCaravana(null);
    };


    return (
        <div className={styles.container}>
            <div className={styles.titulo}>
                <h2>Lista de Caravanas</h2>
            </div>
            <div className={styles.cardContainer}>
                {caravanas.map(caravana => ( // Itera sobre as caravanas *já filtradas*
                    <CaravanaCard key={caravana.id} caravana={caravana}>
                        <div>
                            <button className={styles.verDetalhes} onClick={() => openModal(caravana)}>Ver Detalhes</button>
                        </div>
                    </CaravanaCard>
                ))}
            </div>

            {selectedCaravana && (
                <ModalDetalhesCaravanaUsuario
                    caravana={selectedCaravana}
                    onClose={closeModal}
                />
            )}
        </div>
    );
}

export default ListaCaravanasUsuario;
