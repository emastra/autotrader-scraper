# Autotrader Scraper

Autotrader Scraper is an [Apify actor](https://apify.com/actors) for searching and extracting data from [Autotrader](https://www.autotrader.com/) web site. It is build on top of [Apify SDK](https://sdk.apify.com/) and you can run it both on [Apify platform](https://my.apify.com) and locally.

- [Input](#input)
- [Input Example](#input-example)
- [Output](#output)
- [Extend output function](#extend-output-function)
- [Open an issue](#open-an-issue)

### Input

| Field | Type | Description |
| ----- | ---- | ----------- |
| enablePredefinedFilters | boolean | (Required if 'startUrls' is not provided) Enable predefined filter section |
| zipcode | integer | Location zipcode for search |
| searchWithin | integer | Radius of the search with zipcode as center (in Miles) |
| condition | string | Condition of the car to search |
| minimumPrice | string | Minimum price filter |
| maximumPrice | string | Maximum price filter |
| style | string | Style of the car to search |
| driveType | string | Type of car drive |
| fromYear | string | Minimum year of the car |
| toYear | string | Maximum year of the car |
| make | string | Car make |
| mileage | string | Miliage of the car |
| startUrls | array | (Optional if 'predefined filters' are enabled) List of search URLs to start the scraping. It must be a search url including querystring for filters. Check next chapter for details |
| maxItems | integer | Limit of items to be scraped. Zero value means no limit |
| extendOutputFunction | string | (optional) Function that takes a JQuery handle ($) as argument and returns data that will be merged with the default output. More information in [Extend output function](#extend-output-function) |
| proxyConfiguration | object | (optional) Proxy settings of the run. If you have access to Apify proxy, leave the default settings. If not, you can set `{ "useApifyProxy": false" }` to disable proxy usage or use your own proxy server(s) |

### Input example

*INPUT Example with predefined filters:*

```
{
  "enablePredefinedFilters": true,
  "zipcode": 90001,
  "searchWithin": 200,
  "condition": "USED",
  "minimumPrice": "1000",
  "maximumPrice": "8000",
  "style": "VANMV",
  "driveType": "ANY",
  "fromYear": "2001",
  "toYear": "2018",
  "make": "ANY",
  "mileage": "200000",
  "maxItems": 0,
  "extendOutputFunction": "($) => { return { test: 1234, test2: 5678 } }",
  "proxyConfiguration": {
    "useApifyProxy": true
  }
}
```

*INPUT Example with predefined filters:*
(Optional if 'predefined filters' are enabled) Search is based on URL query string. You can insert multiple URLs. Filters must be in the query string, each URL query string can contain any allowed filter from [Autotrader advanced search](https://www.autotrader.com/cars-for-sale/).

Base url is: https://www.autotrader.com/cars-for-sale/searchresults.xhtml

```
https://www.autotrader.com/cars-for-sale/searchresults.xhtml?maxMileage=75000&searchRadius=300&zip=94203&listingTypes=USED&minPrice=2000&maxPrice=12000&vehicleStyleCodes=CONVERT,SEDAN,SUVCROSS,WAGON&startYear=2005&endYear=2020&driveGroup=AWD4WD,FWD,RWD&engineCodes=5CLDR,6CLDR&transmissionCodes=AUT,MAN&fuelTypeGroup=GSL,DSL,HYB&doorCodes=4,5&extColorsSimple=BLACK,BLUE
```

### Output

Output is stored in a dataset.
Each item will contain the search term and all values keyed by the corresponding date.

Example of one output item:
```
{
  "url": "https://www.autotrader.com/cars-for-sale/vehicledetails.xhtml?listingId=541833160",
  "title": "Used 2016 Dodge Grand Caravan SXT",
  "price": "11,888",
  "imageURL1": "https://images.autotrader.com/borderscaler/800/600/2d363e/hn/c/2a92e88f62b64084be5433c07e5882bd.jpg",
  "imageURL2": "https://images.autotrader.com/borderscaler/800/600/2d363e/hn/c/2a819b87f9d34cf0b84747eaae59342f.jpg",
  "imageURL3": "https://images.autotrader.com/borderscaler/800/600/2d363e/hn/c/0308a4daf7c84e2a9b049e6c3eaad7aa.jpg",
  "imageURL4": "https://images.autotrader.com/borderscaler/800/600/2d363e/hn/c/3afee644864a4d41bfb0cb8835f9467b.jpg",
  "mileage": "84,822",
  "driveType": "2 wheel drive - front",
  "engine": "6-Cylinder",
  "transmission": "6-Speed Automatic",
  "fuelType": "Flexible Fuel",
  "mpg": "17 City / 25 Highway",
  "exterior": "Granite Crystal Metallic Clearcoat",
  "interior": "Black",
  "stockNumber": "M53389",
  "vin": "2C4RDGCG6GR367126",
  "searchUrl": "https://www.autotrader.com/cars-for-sale/searchresults.xhtml?listingTypes=USED&minPrice=1000&maxPrice=12000&vehicleStyleCodes=VANMV&startYear=1996&endYear=2021&maxMileage=200000&numRecords=100&firstRecord=0"
}
```

### Extend output function

You can use this function to update the default output of this actor. This function gets a JQuery handle `$` as an argument so you can choose what data from the page you want to scrape. The output from this will function will get merged with the default output.

The **return value** of this function has to be an **object**!

You can return fields to achieve 3 different things:
- Add a new field - Return object with a field that is not in the default output
- Change a field - Return an existing field with a new value
- Remove a field - Return an existing field with a value `undefined`

The following example will add a new field:
```
($) => {
    return {
        comment: 'This is a comment',
    }
}
```

### Open an issue
If you find any bug, please create an issue on the actor [Github page](https://github.com/emastra/actor-autotrader-scraper).
