// openalex.js
function processOpenAlexAbstract(abstract) {
    if (!abstract || typeof abstract !== 'object') {
        return 'No abstract available';
    }
    
    const words = Object.keys(abstract);
    const positions = Object.values(abstract).flat();
    const abstractArray = new Array(Math.max(...positions) + 1);
    
    for (let i = 0; i < words.length; i++) {
        const word = words[i];
        const wordPositions = abstract[word];
        for (const position of wordPositions) {
            abstractArray[position] = word;
        }
    }
    
    return abstractArray.filter(word => word !== undefined).join(' ');
}


async function searchOpenAlex(queryParams) {
    const { query, author, title, fromYear, toYear, type, rows } = queryParams;

    let apiUrl = 'https://api.openalex.org/works?';
    const params = new URLSearchParams({
        search: query,
        per_page: rows || 25 // Use the rows parameter or default to 25
    });

    if (author) params.append('filter', `author.display_name:${author}`);
    if (title) params.append('filter', `title.search:${title}`);
    if (fromYear) params.append('filter', `from_publication_date:${fromYear}-01-01`);
    if (toYear) params.append('filter', `to_publication_date:${toYear}-12-31`);
    if (type) params.append('filter', `type:${type}`);

    apiUrl += params.toString();

    try {
        const response = await fetch(apiUrl);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        const numFound = data.meta.count;
        const items = data.results.map(item => ({
            title: [item.title],
            DOI: item.doi,
            author: item.authorships.map(a => ({
                given: a.author.display_name.split(' ')[0],
                family: a.author.display_name.split(' ').slice(1).join(' ')
            })),
            issued: { 'date-parts': [[item.publication_year]] },
            type: item.type,
            abstract: processOpenAlexAbstract(item.abstract_inverted_index),
            score: item.relevance_score,
            link: item.open_access?.oa_url ? [{ 'content-type': 'application/pdf', URL: item.open_access.oa_url }] : [],
            license: item.open_access?.is_oa ? [{}] : []
        }));

        return { numFound, items };
    } catch (error) {
        console.error('Error fetching OpenAlex results:', error);
        return { numFound: 0, items: [] };
    }
}


async function fetchOpenAlexPage(query, author, title, fromYear, toYear, type, offset, limit) {
    let apiUrl = 'https://api.openalex.org/works?';
    const params = new URLSearchParams({
        search: query,
        page: Math.floor(offset / limit) + 1,
        per_page: limit
    });

    if (author) params.append('author', author);
    if (title) params.append('title', title);

    const filters = [];
    if (fromYear) {
        filters.push(`from_publication_date:${fromYear}-01-01`);
    }
    if (toYear) {
        filters.push(`to_publication_date:${toYear}-12-31`);
    }
    if (type) filters.push(`type:${type}`);

    if (document.getElementById('pdfOnlyCheckbox').checked) {
        filters.push('has_pdf:true');
    }

    if (filters.length > 0) {
        params.append('filter', filters.join(','));
    }

    apiUrl += params.toString();

    const response = await fetch(apiUrl);
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    const items = data.results;

    return items;
}
