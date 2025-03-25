const translateStatus = (status) => {
    switch (status) {
        case 'confirmada':
            return 'Confirmada';
        case 'nao_confirmada':
            return 'Não Confirmada';
        case 'cancelada':
            return 'Cancelada';
        default:
            return 'Status Desconhecido';
    }
};
export default translateStatus;