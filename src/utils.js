const Apify = require('apify')
const querystring = require('querystring')
const _ = require('underscore')

const { log } = Apify.utils

const BASE_SEARCH_URL = 'https://www.autotrader.com/cars-for-sale/all-cars/'

function validateInput (input) {
  if (!input) throw new Error('INPUT is missing.')
  if (!input.zipcode && !input.startUrls)
    throw new Error('INPUT must have "zipcode" or "startUrls".')

  // validate function
  const validate = (inputKey, type = 'string') => {
    const value = input[inputKey]

    if (type === 'array') {
      if (!Array.isArray(value)) {
        throw new Error(`Value of ${inputKey} should be array`)
      }
    } else if (value) {
      if (typeof value !== type) {
        throw new Error(`Value of ${inputKey} should be ${type}`)
      }
    }
  }

  // check correct types
  if (input.zipcode) validate('zipcode', 'number') // Posso levare questi if, c'è sempre un default del type giusto!
  if (input.searchWithin) validate('searchWithin', 'number')
  validate('condition', 'string')
  validate('minimumPrice', 'string')
  validate('maximumPrice', 'string')
  validate('style', 'string')
  validate('driveType', 'string')
  validate('fromYear', 'string')
  validate('toYear', 'string')
  validate('make', 'string')
  validate('mileage', 'string')
  if (input.startUrls) validate('startUrls', 'array')
  if (input.maxItems) validate('maxItems', 'number')
  if (input.extendOutputFunction) validate('extendOutputFunction', 'string')
  validate('proxyConfiguration', 'object')
}

function createUrlsFromSearches (input) {
  const searchInput = _.pick(
    input,
    'enablePredefinedFilters',
    'zipcode',
    'searchWithin',
    'condition',
    'minimumPrice',
    'maximumPrice',
    'style',
    'driveType',
    'fromYear',
    'toYear',
    'make',
    'model',
    'mileage'
  )

  // if not predefined filters, return empty array
  if (!searchInput.enablePredefinedFilters) return []
  if (_.isEmpty(searchInput)) return []

  const mapping = {
    zipcode: 'zip',
    searchWithin: 'searchRadius',
    condition: 'listingTypes',
    minimumPrice: 'minPrice',
    maximumPrice: 'maxPrice',
    style: 'vehicleStyleCodes',
    driveType: 'driveGroup',
    fromYear: 'startYear',
    toYear: 'endYear',
    make: 'makeCodeList',
    model: 'modelCodeList',
    mileage: 'maxMileage'
  }

  let url = BASE_SEARCH_URL + '?'
  const qs = {}

  for (const key of Object.keys(mapping)) {
    const value = searchInput[key]
    if (value && value !== 'ANY' && value !== 0) {
      const queryKey = mapping[key]
      qs[queryKey] = value
    }
  }

  qs.numRecords = 100
  qs.firstRecord = 0

  const searchUrls = []
  const queryStr = querystring.stringify(qs)
  searchUrls.push({ url: url + queryStr })

  return searchUrls
}

function updateStartUrls (startUrls) {
  const updatedStartUrls = []

  if (Array.isArray(startUrls)) {
    for (const { url } of startUrls) {
      const splitUrl = url.split('?')
      const qs = querystring.parse(splitUrl[1])
      qs.numRecords = 100
      if (!qs.firstRecord) qs.firstRecord = 0

      const queryStr = querystring.stringify(qs)
      const updatedUrl = splitUrl[0] + '?' + queryStr

      updatedStartUrls.push({ url: updatedUrl })
    }
  }

  return updatedStartUrls
}

function createSources (urlList) {
  const sources = []

  for (const { url } of urlList) {
    sources.push({ url, userData: { label: 'FILTER' } })
  }

  return sources
}

function maxItemsCheck (maxItems, itemCount) {
  if (itemCount >= maxItems) {
    log.info('Actor reached the max items limit. Crawler is going to halt...')
    log.info('Crawler Finished.')
    process.exit()
  }
}

function checkAndEval (extendOutputFunction) {
  let evaledFunc

  try {
    evaledFunc = eval(extendOutputFunction)
  } catch (e) {
    throw new Error(
      `extendOutputFunction is not a valid JavaScript! Error: ${e}`
    )
  }

  if (typeof evaledFunc !== 'function') {
    throw new Error(
      'extendOutputFunction is not a function! Please fix it or use just default output!'
    )
  }

  return evaledFunc
}

async function applyFunction ($, evaledFunc, items) {
  const isObject = val =>
    typeof val === 'object' && val !== null && !Array.isArray(val)

  let userResult = {}
  try {
    userResult = await evaledFunc($)
  } catch (err) {
    log.error(
      `extendOutputFunction crashed! Pushing default output. Please fix your function if you want to update the output. Error: ${err}`
    )
  }

  if (!isObject(userResult)) {
    log.exception(new Error('extendOutputFunction must return an object!'))
    process.exit(1)
  }

  items.forEach((item, i) => {
    items[i] = { ...item, ...userResult }
  })

  return items
}

function splitFilter (min, max) {
  // Don't forget that max can be null and we have to handle that situation
  if (max && min > max) {
      throw new Error(`WRONG FILTER - min(${min}) is greater than max(${max})`);
  }

  // We crate a middle value for the split. If max in null, we will use double min as the middle value
  const middle = max
      ? min + Math.floor((max - min) / 2)
      : min * 2;

  // We have to do the Math.max and Math.min to prevent having min > max
  const filterMin = {
      min,
      max: Math.max(middle, min),
  };
  const filterMax = {
      min: max ? Math.min(middle + 1, max) : middle + 1,
      max,
  };
  // We return 2 new filters
  return [filterMin, filterMax];
};

module.exports = {
  validateInput,
  createUrlsFromSearches,
  updateStartUrls,
  createSources,
  maxItemsCheck,
  checkAndEval,
  applyFunction,
  splitFilter
}
