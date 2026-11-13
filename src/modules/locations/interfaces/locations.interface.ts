export interface GoogleGeocodingResponse {
    status: string;
    error_message?: string;
    results: {
        formatted_address: string;
        geometry: {
            location: {
                lat: number;
                lng: number;
            };
        };
        types: string[];
    }[];
}