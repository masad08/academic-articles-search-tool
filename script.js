document.addEventListener('DOMContentLoaded', async () => {
    const searchForm = document.getElementById('search-form');
    const retrieveForm = document.getElementById('retrieve-form');
    const resultsCountContainer = document.getElementById('results-count');
    const resultsContainer = document.getElementById('results');
    const exportCsvButton = document.getElementById('export-csv');
    const loadMoreButton = document.getElementById('load-more');
    const crossrefCheckbox = document.querySelector('input[value="crossref"]');
    const openalexCheckbox = document.querySelector('input[value="OpenAlex"]');
    let queryParams = {};
    let searchResults = [];
    let currentOffset = 0;
    const rowsPerPage = 1000;
    let isSearching = false;
    let isRetrieving = false;

    let db;
    await initDatabase();

    function clearDatabase() {
        db.run("DELETE FROM articles");
        searchResults = [];
        currentOffset = 0;
        resultsContainer.innerHTML = '';
        resultsCountContainer.innerHTML = '';
        exportCsvButton.style.display = 'none';
        loadMoreButton.style.display = 'none';
    }

    function loadCrossrefScript() {
        return new Promise((resolve, reject) => {
            if (typeof searchCrossref === 'undefined') {
                const script = document.createElement('script');
                script.src = 'crossref.js';
                script.onload = () => {
                    window.storeDataInDb = storeDataInDb;
                    window.displayResultsFromDb = displayResultsFromDb;
                    resolve();
                };
                script.onerror = (err) => {
                    console.error('Error loading Crossref script:', err);
                    reject(err);
                };
                document.head.appendChild(script);
            } else {
                resolve();
            }
        });
    }

    function loadOpenAlexScript() {
        return new Promise((resolve, reject) => {
            if (typeof searchOpenAlex === 'undefined') {
                const script = document.createElement('script');
                script.src = 'openalex.js';
                script.onload = () => {
                    resolve();
                };
                script.onerror = (err) => {
                    reject(err);
                };
                document.head.appendChild(script);
            } else {
                resolve();
            }
        });
    }

    function disableSearchForm() {
        searchForm.querySelectorAll('input, select, button').forEach(el => el.disabled = true);
    }

    function enableSearchForm() {
        searchForm.querySelectorAll('input, select, button').forEach(el => el.disabled = false);
    }

    function disableRetrieveForm() {
        retrieveForm.querySelectorAll('input, button').forEach(el => el.disabled = true);
    }

    function enableRetrieveForm() {
        retrieveForm.querySelectorAll('input, button').forEach(el => el.disabled = false);
    }

    function showPreloader() {
        document.getElementById('preloader').style.display = 'flex';
    }

    function hidePreloader() {
        document.getElementById('preloader').style.display = 'none';
    }

    async function initDatabase() {
        const SQL = await initSqlJs({ locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.5.0/${file}` });
        db = new SQL.Database();
        db.run("CREATE TABLE IF NOT EXISTS articles (id INTEGER PRIMARY KEY, title TEXT, DOI TEXT, authors TEXT, published TEXT, type TEXT, abstract TEXT, score REAL, pdf_link TEXT, open_access TEXT)");
    }

    function checkInputs() {
        const queryInput = document.getElementById('query');
        const authorInput = document.getElementById('author');
        const titleInput = document.getElementById('title');
        const searchButton = document.getElementById('search-button');

        if (queryInput.value.trim() || authorInput.value.trim() || titleInput.value.trim()) {
            searchButton.disabled = false;
        } else {
            searchButton.disabled = true;
        }
    }

    document.getElementById('query').addEventListener('input', checkInputs);
    document.getElementById('author').addEventListener('input', checkInputs);
    document.getElementById('title').addEventListener('input', checkInputs);

    searchForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (isSearching || isRetrieving) return;
        isSearching = true;
        disableSearchForm();

        resultsContainer.innerHTML = '';

        const query = document.getElementById('query').value;
        const author = document.getElementById('author').value;
        const title = document.getElementById('title').value;
        const fromYear = document.getElementById('from-year').value;
        const toYear = document.getElementById('to-year').value;
        const type = document.getElementById('type').value;

        clearDatabase();

        queryParams = { query, author, title, fromYear, toYear, type, rows: 0 };

        if (crossrefCheckbox.checked) {
            await loadCrossrefScript();
            const { numFound } = await searchCrossref(queryParams);
            resultsCountContainer.innerText = `Found ${numFound} results`;
            resultsCountContainer.style.display = 'block';
            retrieveForm.style.display = 'block';
        }

        if (openalexCheckbox.checked) {
            await loadOpenAlexScript();
            const { numFound } = await searchOpenAlex(queryParams);
            resultsCountContainer.innerText = `Found ${numFound} results`;
            resultsCountContainer.style.display = 'block';
            retrieveForm.style.display = 'block';
        }

        isSearching = false;
        enableSearchForm();
    });

    retrieveForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (isSearching || isRetrieving) return;
        isRetrieving = true;
        disableRetrieveForm();
        showPreloader();

        const numResults = parseInt(document.getElementById('num-results').value);
        queryParams.rows = numResults;
        currentOffset = 0;
        searchResults = [];
        resultsContainer.innerHTML = '';

        if (crossrefCheckbox.checked) {
            await loadCrossrefScript();
            const { items } = await searchCrossref(queryParams);
            storeDataInDb(items);
            await displayResultsFromDb(0, numResults);
        }

        if (openalexCheckbox.checked) {
            await loadOpenAlexScript();
            const { items } = await searchOpenAlex(queryParams);
            storeDataInDb(items);
            await displayResultsFromDb(0, numResults);
        }

        exportCsvButton.style.display = 'block';

        hidePreloader();
        isRetrieving = false;
        enableRetrieveForm();
    });


    exportCsvButton.addEventListener('click', () => {
        const csvContent = convertToCsv(searchResults);
        downloadCsv(csvContent);
    });

    loadMoreButton.addEventListener('click', async () => {
        if (isRetrieving) return;
        isRetrieving = true;
        disableRetrieveForm();
        showPreloader();

        if (crossrefCheckbox.checked) {
            await fetchCrossrefResults(queryParams, queryParams.rows);
        }

        if (openalexCheckbox.checked) {
            await fetchOpenAlexResults(queryParams, queryParams.rows);
        }

        hidePreloader();
        isRetrieving = false;
        enableRetrieveForm();
    });

    function storeDataInDb(items) {
        if (!db) {
            console.error('Database is not initialized');
            return;
        }

        const stmt = db.prepare("INSERT INTO articles (title, DOI, authors, published, type, abstract, score, pdf_link, open_access) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
        const pdfOnly = document.getElementById('pdfOnlyCheckbox').checked;

        items.forEach(item => {
            const title = item.title ? item.title.join('; ') : 'No title available';
            const DOI = item.DOI || 'N/A';
            const authors = item.author ? item.author.map(author => `${author.given} ${author.family}`).join(', ') : 'N/A';
            const published = item.issued ? formatDate(item.issued) : 'N/A';
            const type = item.type || 'N/A';
            const abstract = item.abstract ? item.abstract.replace(/<\/?jats:p>/g, '').replace(/[\r\n]+/g, ' ').replace(/"/g, '""') : 'No abstract available';
            const score = item.score || 'N/A';
            let pdfLink = 'N/A';

            if (item.link) {
                const pdf = item.link.find(link => link['content-type'] === 'application/pdf');
                if (pdf) {
                    pdfLink = pdf.URL;
                }
            }

            let openAccess = 'No';
            if (item.license && item.license.length > 0) {
                openAccess = 'Yes';
            }

            if (!pdfOnly || (pdfOnly && pdfLink !== 'N/A')) {
                stmt.run([title, DOI, authors, published, type, abstract, score, pdfLink, openAccess]);
            }
        });

        stmt.free();
    }

    async function fetchCrossrefResults(queryParams, numResults) {
        while (currentOffset < numResults) {
            const fetchLimit = Math.min(rowsPerPage, numResults - currentOffset);
            try {
                const pageResults = await fetchCrossrefPage(queryParams, currentOffset, fetchLimit);
                searchResults = searchResults.concat(pageResults);
                await displayResultsFromDb(0, currentOffset + fetchLimit);
                currentOffset += fetchLimit;

                await new Promise(resolve => setTimeout(resolve, 1000));

                if (currentOffset >= numResults) {
                    break;
                }
            } catch (error) {
                console.error('Error fetching Crossref results:', error);
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }

        if (currentOffset >= numResults) {
            loadMoreButton.style.display = 'none';
        }
        exportCsvButton.style.display = 'block';
    }

    async function fetchOpenAlexResults(queryParams, numResults) {
        while (currentOffset < numResults) {
            const fetchLimit = Math.min(rowsPerPage, numResults - currentOffset);
            try {
                const pageResults = await fetchOpenAlexPage(queryParams, currentOffset, fetchLimit);
                searchResults = searchResults.concat(pageResults);
                await displayResultsFromDb(0, currentOffset + fetchLimit);
                currentOffset += fetchLimit;

                await new Promise(resolve => setTimeout(resolve, 1000));

                if (currentOffset >= numResults) {
                    break;
                }
            } catch (error) {
                console.error('Error fetching OpenAlex results:', error);
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }

        if (currentOffset >= numResults) {
            loadMoreButton.style.display = 'none';
        }
        exportCsvButton.style.display = 'block';
    }

    async function fetchCrossrefPage(queryParams, offset, rowsPerPage) {
        let apiUrl = 'https://api.crossref.org/works?';
        const params = new URLSearchParams({
            query: queryParams.query,
            rows: rowsPerPage,
            offset: offset,
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

        const response = await fetch(apiUrl);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        const items = data.message.items;

        storeDataInDb(items);
        return items;
    }

    async function fetchOpenAlexPage(queryParams, offset, rowsPerPage) {
        let apiUrl = 'https://api.openalex.org/works?';
        const params = new URLSearchParams({
            search: queryParams.query,
            page: Math.floor(offset / rowsPerPage) + 1,
            per_page: rowsPerPage
        });

        if (queryParams.author) params.append('author', queryParams.author);
        if (queryParams.title) params.append('title', queryParams.title);

        const filters = [];
        if (queryParams.fromYear) {
            filters.push(`from_publication_date:${queryParams.fromYear}-01-01`);
        }
        if (queryParams.toYear) {
            filters.push(`to_publication_date:${queryParams.toYear}-12-31`);
        }
        if (queryParams.type) filters.push(`type:${queryParams.type}`);

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

        storeDataInDb(items);
        return items;
    }

    async function displayResultsFromDb(offset, limit) {
        resultsContainer.innerHTML = '';
        const stmt = db.prepare("SELECT * FROM articles LIMIT ? OFFSET ?");
        searchResults = []; 
        stmt.bind([limit, offset]);

        while (stmt.step()) {
            const result = stmt.getAsObject();
            searchResults.push(result);
        }

        stmt.free();
        displayResults(searchResults);
    }


    function displayResults(items) {
        if (currentOffset === 0) {
            resultsContainer.innerHTML = '';
        }

        if (items.length === 0) {
            resultsContainer.innerHTML = 'No results found.';
            return;
        }

        items.forEach(item => {
            const article = document.createElement('div');
            article.classList.add('article');

            const authors = item.authors;
            const publishedDate = item.published;
            const pdfLink = item.pdf_link !== 'N/A' ? `<a href="${item.pdf_link}" target="_blank">PDF Available</a>` : 'N/A';

            const openAccess = item.open_access === 'Yes' ? 'Yes' : 'No';
            const DOI = item.DOI !== 'N/A' ? `${item.DOI}` : 'N/A';

            article.innerHTML = `
                <h3>${item.title}</h3>
                <p><strong>DOI:</strong> ${DOI}</p>
                <p><strong>Author(s):</strong> ${authors}</p>
                <p><strong>Published:</strong> ${publishedDate}</p>
                <p><strong>Type:</strong> ${item.type || 'N/A'}</p>
                <p><strong>Abstract:</strong> ${item.abstract || 'No abstract available'}</p>
                <p><strong>Relevance Score:</strong> ${item.score || 'N/A'}</p>
                <p><strong>PDF:</strong> ${pdfLink}</p>
                <p><strong>Open Access:</strong> ${openAccess}</p>
            `;

            resultsContainer.appendChild(article);
        });
    }

    function formatDate(dateObject) {
        if (!dateObject || !dateObject['date-parts'] || !dateObject['date-parts'][0]) {
            return 'N/A';
        }
        const dateParts = dateObject['date-parts'][0];
        if (dateParts.length === 3) {
            return `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;
        } else if (dateParts.length === 2) {
            return `${dateParts[1]}/${dateParts[0]}`;
        } else if (dateParts.length === 1) {
            return `${dateParts[0]}`;
        } else {
            return 'N/A';
        }
    }

    function convertToCsv(items) {
        const headers = ["Title", "DOI", "Authors", "Published", "Type", "Abstract", "Relevance Score", "PDF", "Open Access"];
        const rows = items.map(item => {
            const title = item.title ? item.title : 'No title available';
            const DOI = item.DOI ? item.DOI : 'N/A';
            const authors = item.authors ? item.authors : 'N/A';
            const published = item.published ? item.published : 'N/A';
            const type = item.type || 'N/A';
            const abstract = item.abstract ? item.abstract.replace(/<[^>]*>/g, '').trim().replace(/[\r\n]+/g, ' ').replace(/"/g, '""') : 'No abstract available';
            const score = item.score || 'N/A';
            const pdfLink = item.pdf_link || 'N/A';
            const openAccess = item.open_access ? 'Yes' : 'No';

            return `"${title}","${DOI}","${authors}","${published}","${type}","${abstract}","${score}","${pdfLink}","${openAccess}"`;
        });

        return [headers.join(','), ...rows].join('\n');
    }

    function downloadCsv(csvContent) {
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", "search_results.csv");
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
});
