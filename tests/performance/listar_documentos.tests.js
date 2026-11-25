import http from 'k6/http';
import { sleep, check } from 'k6';

export const options = {
    // Stages — define a rampa de usuários virtuais
    stages: [
        { duration: '5s', target: 10 },  // sobe para 10 usuários em 5 segundos
        { duration: '20s', target: 10 }, // mantém 10 usuários por 20 segundos
        { duration: '5s', target: 0 },   // desce para 0 usuários em 5 segundos
    ],
    // Thresholds — critérios de aprovação do teste
    thresholds: {
        http_req_duration: ['p(90)<3000', 'max<5000'], // 90% das requisições em menos de 3s
        http_req_failed: ['rate<0.01'],                // menos de 1% de falhas
    },
};

export default function () {
    const resposta = http.get('http://localhost:3000/api/documents');
    check(resposta, {
        'Status code deve ser 200': (r) => r.status === 200,
    });

    // const resposta = http.get('http://localhost:3000/api/documents');
    // console.log(resposta);


    sleep(10);
}