const Apify = require('apify');
const { log, puppeteer } = Apify.utils;
const querystring = require('querystring');
const httpRequest = require('@apify/http-request');

const {
    validateInput,
    createUrlsFromSearches,
    updateStartUrls,
    createSources,
    maxItemsCheck,
    checkAndEval,
    applyFunction,
} = require('./utils');

const REST_BASE_URL = 'https://www.autotrader.com/rest/searchresults/base';

// // screenshot stuff
// const saveScreen = async (page, key = 'debug-screen') => {
//     const screenshotBuffer = await page.screenshot({ fullPage: true });
//     await Apify.setValue(key, screenshotBuffer, { contentType: 'image/png' });
// };
// let screenshotNum = 0;


Apify.main(async () => {
    const input = await Apify.getInput();
    validateInput(input);

    const {
        enablePredefinedFilters = false,
        zipcode = 0,
        searchWithin = 0,
        condition,
        minimumPrice,
        maximumPrice,
        style,
        driveType,
        fromYear,
        toYear,
        make,
        mileage,
        startUrls,
        maxItems,
        extendOutputFunction,
        proxyConfiguration
    } = input;

    if (maxItems) log.info('maxItems set to ' + maxItems);

    // create searchUrls from INPUT searches params //! it's a single url inside an array!!!
    const searchUrls = createUrlsFromSearches(input);
    // update startUrls (with numRecords and firstRecord)
    const updatedStartUrls = updateStartUrls(startUrls);

    // create sources
    const sources1 = searchUrls ? createSources(searchUrls) : [];
    const sources2 = startUrls ? createSources(updatedStartUrls) : [];
    const sources = sources1.concat(sources2);

    // log all source urls
    log.info('Source URLs:');
    sources.forEach(s => console.log(s.url));

    // initialize request list from url sources
    const requestList = await Apify.openRequestList('start-list', sources);

    // open request queue
    const requestQueue = await Apify.openRequestQueue();

    // open dataset and get itemCount
    const dataset = await Apify.openDataset();
    let { itemCount } = await dataset.getInfo();

    // if exists, evaluate extendOutputFunction
    let evaledFunc;
    if (extendOutputFunction) evaledFunc = checkAndEval(extendOutputFunction);

    // crawler config
    const crawler = new Apify.PuppeteerCrawler({
        requestList,
        requestQueue,
        maxRequestRetries: 3,
        handlePageTimeoutSecs: 240,
        maxConcurrency: 20,
        launchPuppeteerOptions: {
            useApifyProxy: proxyConfiguration.useApifyProxy,
            timeout: 120 * 1000,
            useChrome: true,
            stealth: true,
            headless: true,
            // devtools: true
        },
        useSessionPool: proxyConfiguration.useApifyProxy,

        gotoFunction: async ({ request, page }) => {
            await Apify.utils.puppeteer.blockRequests(page, {
                extraUrlPatterns: [ 'brain.foresee.com*', 'c.amazon-adsystem.com*' ]
            });

            return page.goto(request.url, {
                timeout: 180 * 1000,
                waitUntil: 'load' // networkidle0
            });
        },

        handlePageFunction: async ({ page, request, session }) => {
            // if exists, check items limit. If limit is reached crawler will exit.
            if (maxItems) maxItemsCheck(maxItems, itemCount);

            log.info('Processing:', request.url);
            const { label } = request.userData;

            if (label === 'LIST') {
                const searchUrl = request.url;

                const info = await Apify.utils.enqueueLinks({
                    page,
                    requestQueue,
                    selector: 'div.display-flex.justify-content-between > a',
                    pseudoUrls: ['https://www.autotrader.com/cars-for-sale/vehicledetails.xhtml?listingId=[.*]'],
                    transformRequestFunction: (req) => {
                        req.url = req.url.split('&')[0];
                        req.userData.label = 'ITEM';
                        req.userData.searchUrl = searchUrl;
                        return req;
                    }
                });
                log.info(`Enqueued ${info.length} items`);

                // check if page was blocked or No Results. MAYBE didn't load for some reasons? check screenshot
                if (info.length === 0) {
                    const title = await page.title();
                    const isNoResults = await page.evaluate(() => {
                        return !!Array.from(document.getElementsByTagName('strong')).filter(el => el.textContent.trim() === 'No results found.')[0];
                    });

                    if (title.includes('page unavailable') || title.includes('Access Denied')) {
                        session.retire();
                        request.retryCount--; // ?? alternative ??
                        throw new Error('Access Denied.');
                    }
                    else if (isNoResults) {
                        // request.noRetry = true; //!
                        throw new Error('No results with your filters. Please set less specific filters in your INPUT and try again.');
                    }
                    else {
                        // await saveScreen(page, `list-screen${screenshotNum}`);
                        // console.log('screenshot done', screenshotNum);
                        // screenshotNum++;
                        // console.log('!!!! title:', title, screenshotNum);

                        session.markBad();
                        throw new Error('No data was available.');
                    }
                }

                // check if this is the first result page
                const qs = querystring.parse(searchUrl.split('?')[1]);
                const isFirstPage = !Number(qs.firstRecord);
                // console.log('isFirstPage', isFirstPage, qs.firstRecord);

                if (isFirstPage) {
                    // get total pages
                    const { body, statusCode } =  await httpRequest({ url: REST_BASE_URL + '?' + querystring.stringify(qs), json: true });
                    const totalResults = body.totalResultCount;
                    log.info('totalResultCount: ' + totalResults);

                    if (totalResults > 10000) {
                        log.warning(`
                            There are more than 10.000 results to scrape. Be aware it will take a while.
                            If this is not intended, abort this run and adjust your filters.
                        `);
                    }

                    // calculate total pages
                    let totalPages;
                    if (totalResults <= 100) totalPages = 1;
                    else totalPages = Math.ceil(totalResults / 100);

                    // enqueue all urls of the result pages
                    for (let i = 1; i < totalPages; i++) {
                        const url = searchUrl.split('?')[0];
                        const qs = querystring.parse(searchUrl.split('?')[1]);

                        qs.firstRecord = String(Number(qs.firstRecord) + (100 * i));
                        const newQs = querystring.stringify(qs);
                        const nextUrl = url + '?' + newQs;

                        await requestQueue.addRequest({
                            url: nextUrl,
                            userData: { label: 'LIST' }
                        });

                        log.info('Next page enqueued:', nextUrl);
                    }
                }

                // slow down
                await page.waitFor(500);
            }

            if (label === 'ITEM') {
                // check if page was blocked or didn't load for some reasons
                try {
                    await page.waitForSelector('div.media-pane-wrapper-md', { timeout: 90*1000 });
                } catch (err) {
                    const title = await page.title();

                    if (title.includes('page unavailable') || title.includes('Access Denied')) {
                        session.retire();
                        throw new Error('Access Denied.');
                    }
                    else {
                        // await saveScreen(page, `item-screen${screenshotNum}`);
                        // console.log('screenshot done', screenshotNum);
                        // screenshotNum++;
                        // console.log('!!!! title:', title, screenshotNum);

                        session.markBad();
                        throw new Error('Data not available.');
                    }
                }

                const data = await page.evaluate((currentUrl) => {
                    const getElementsByText = (str, tag, rootElement = document) => {
                        return Array.prototype.slice.call(rootElement.getElementsByTagName(tag)).filter(el => el.textContent.trim() === str.trim());
                    }

                    const url = currentUrl;
                    const title = document.querySelector('h1').textContent;
                    const price = Number(document.querySelector('span.first-price').textContent.replace(',', ''));
                    const media = document.querySelector('div.media-pane-wrapper-md');
                    const imgDivs = Array.from(media.querySelectorAll('div.text-center.carousel-cell.carousel-full-width')).slice(0, 4);
                    const [ imageURL1, imageURL2, imageURL3, imageURL4 ] = imgDivs.map((div) => {
                        if (div.querySelector('img'))
                            return div.querySelector('img').src || div.querySelector('img').dataset.flickityLazyload;
                        return null;
                    });
                    const ul = document.querySelector('ul[data-cmp="listColumns"]');
                    const mileage = Number(getElementsByText('MILEAGE', 'div', ul)[0].nextSibling.textContent.replace(',', ''));
                    const driveType = getElementsByText('DRIVE TYPE', 'div', ul)[0].nextSibling.textContent;
                    const engine = getElementsByText('ENGINE', 'div', ul)[0].nextSibling.textContent;
                    const transmission = getElementsByText('TRANSMISSION', 'div', ul)[0].nextSibling.textContent;
                    const fuelType = getElementsByText('FUEL TYPE', 'div', ul)[0].nextSibling.textContent;
                    const mpg = getElementsByText('MPG', 'div', ul)[0]
                        ? getElementsByText('MPG', 'div', ul)[0].nextSibling.textContent
                        : getElementsByText('RANGE', 'div', ul)[0].nextSibling.textContent + ' (RANGE)';
                    const exterior = getElementsByText('EXTERIOR', 'div', ul)[0].nextSibling.textContent;
                    const interior = getElementsByText('INTERIOR', 'div', ul)[0].nextSibling.textContent;
                    const stockNumber = getElementsByText('STOCK NUMBER', 'div', ul)[0].nextSibling.textContent;
                    const vin = getElementsByText('VIN', 'div', ul)[0].nextSibling.textContent;

                    return {
                        url,
                        title,
                        price,
                        imageURL1,
                        imageURL2,
                        imageURL3,
                        imageURL4,
                        mileage,
                        driveType,
                        engine,
                        transmission,
                        fuelType,
                        mpg,
                        exterior,
                        interior,
                        stockNumber,
                        vin
                    }

                }, request.url);

                data.searchUrl = request.userData.searchUrl;

                await dataset.pushData(data);
                itemCount++;
                log.info(data.vin + ' pushed.');
            }

            // slow down
            await page.waitFor(500);
        },

        handleFailedRequestFunction: async ({ request }) => {
            log.warning(`Request ${request.url} failed too many times`);

            await dataset.pushData({
                '#debug': Apify.utils.createRequestDebugInfo(request),
            });
        },
    });

    log.info('Starting crawler.');
    await crawler.run();

    log.info('Crawler Finished.');
});
