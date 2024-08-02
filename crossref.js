async function searchCrossref(queryParams) {
    let storeDataInDb;
    let displayResultsFromDb;
    
    if (typeof window.storeDataInDb === 'function') {
        storeDataInDb = window.storeDataInDb;
    } else {
        console.error('storeDataInDb function is not available');
    }
    
    if (typeof window.displayResultsFromDb === 'function') {
        displayResultsFromDb = window.displayResultsFromDb;
    } else {
        console.error('displayResultsFromDb function is not available');
    }
    
    let apiUrl = 'https://api.crossref.org/works?';
    const params = new URLSearchParams({
        query: queryParams.query,
        rows: 1000,
        offset: 0,
        select: 'DOI,title,author,issued,type,abstract,score,link,license'
    });

    if (queryParams.author) params.append('query.author', queryParams.author);
    if (queryParams.title) params.append('query.title', queryParams.title);

    const currentYear = new Date().getFullYear();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayFormatted = yesterday.toISOString().split('T')[0];

    const filters = [];
    if (queryParams.fromYear) {
        const fromDate = `${queryParams.fromYear}-01-01`;
        filters.push(`from-pub-date:${fromDate}`);
    }
    if (queryParams.toYear) {
        const untilDate = (queryParams.toYear == currentYear) ? yesterdayFormatted : `${queryParams.toYear}-12-31`;
        filters.push(`until-pub-date:${untilDate}`);
    }
    if (queryParams.type) filters.push(`type:${queryParams.type}`);
    filters.push(`has-abstract:true`);

    if (document.getElementById('pdfOnlyCheckbox').checked) {
        filters.push('has-full-text:true');
    }

    if (filters.length > 0) {
        params.append('filter', filters.join(','));
    }

    apiUrl += params.toString();

    try {
        const response = await fetch(apiUrl);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        const items = data.message.items;

        const numFound = data.message['total-results'];
        const resultsCountContainer = document.getElementById('results-count');

        resultsCountContainer.innerText = `Found ${numFound} results`;
        resultsCountContainer.style.display = 'block';
        return { numFound, items };
    } catch (error) {
        console.error('Error fetching Crossref results:', error);
    }
}
