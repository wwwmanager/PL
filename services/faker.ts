// A simple, self-contained faker utility to avoid large dependencies.
const randomElement = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

const FIRST_NAMES = ['Иван', 'Петр', 'Сергей', 'Александр', 'Дмитрий', 'Андрей', 'Алексей', 'Максим', 'Владимир', 'Евгений', 'Анна', 'Мария', 'Елена', 'Ольга', 'Наталья'];
const LAST_NAMES = ['Иванов', 'Петров', 'Сергеев', 'Александров', 'Дмитриев', 'Андреев', 'Алексеев', 'Максимов', 'Владимиров', 'Евгеньев', 'Кузнецов', 'Смирнов', 'Попов'];
const MIDDLE_NAMES = ['Иванович', 'Петрович', 'Сергеевич', 'Александрович', 'Дмитриевич', 'Андреевич', 'Алексеевич', 'Максимович', 'Владимирович', 'Евгеньевич'];
const COMPANIES = ['Логистик', 'Транс', 'Авто', 'Экспресс', 'Карго', 'Груз', 'Доставка', 'Сервис'];
const CITIES = ['Москва', 'Санкт-Петербург', 'Новосибирск', 'Екатеринбург', 'Казань', 'Нижний Новгород', 'Челябинск', 'Самара', 'Омск', 'Ростов-на-Дону'];
const STREETS = ['ул. Ленина', 'пр. Мира', 'ул. Пушкина', 'ул. Гагарина', 'ул. Советская', 'ш. Энтузиастов'];
const VEHICLE_MAKES = ['КамАЗ', 'ГАЗ', 'МАЗ', 'УРАЛ', 'Scania', 'Volvo', 'MAN', 'Mercedes-Benz', 'Ford', 'Hyundai'];
const VEHICLE_MODELS = ['5490', 'NEXT', '5340', '4320', 'R-series', 'FH', 'TGS', 'Actros', 'Transit', 'HD78'];
const LETTERS = 'АВЕКМНОРСТУХ'.split('');

export const faker = {
    string: {
        numeric: (length: number): string => ''.padStart(length, '0').replace(/0/g, () => Math.floor(Math.random() * 10).toString()),
        alphanumeric: ({ length, casing }: { length: number, casing: 'upper' | 'lower' }): string => {
            let result = '';
            const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
            for (let i = 0; i < length; i++) {
                result += characters.charAt(Math.floor(Math.random() * characters.length));
            }
            return casing === 'upper' ? result : result.toLowerCase();
        }
    },
    number: {
        int: ({ min, max }: { min: number, max: number }): number => Math.floor(Math.random() * (max - min + 1)) + min,
        float: ({ min, max, precision }: { min: number, max: number, precision: number }): number => {
            const value = Math.random() * (max - min) + min;
            return parseFloat(value.toFixed(precision));
        }
    },
    person: {
        fullName: (): string => `${randomElement(LAST_NAMES)} ${randomElement(FIRST_NAMES)} ${randomElement(MIDDLE_NAMES)}`
    },
    company: {
        name: (): string => `${randomElement(COMPANIES)}-${randomElement(COMPANIES)}`
    },
    location: {
        city: (): string => randomElement(CITIES),
        streetAddress: (includeStreet?: boolean): string => `${includeStreet ? randomElement(STREETS) + ', ' : ''}д. ${faker.number.int({min: 1, max: 150})}`
    },
    vehicle: {
        manufacturer: (): string => randomElement(VEHICLE_MAKES),
        model: (): string => randomElement(VEHICLE_MODELS),
        vin: (): string => faker.string.alphanumeric({ length: 17, casing: 'upper' }),
        vrm: (): string => `${randomElement(LETTERS)}${faker.string.numeric(3)}${randomElement(LETTERS)}${randomElement(LETTERS)}${faker.string.numeric(2)}`,
    },
    date: {
        past: ({ years, refDate }: { years: number, refDate?: Date }): Date => {
            const baseTime = refDate ? refDate.getTime() : Date.now();
            return new Date(baseTime - Math.random() * years * 365 * 24 * 60 * 60 * 1000);
        },
        future: ({ years }: { years: number }): Date => new Date(Date.now() + Math.random() * years * 365 * 24 * 60 * 60 * 1000),
        recent: ({ days }: { days: number }): Date => new Date(Date.now() - Math.random() * days * 24 * 60 * 60 * 1000)
    },
    helpers: {
        arrayElement: <T>(arr: T[]): T => randomElement(arr),
        weightedArrayElement: <T>(arr: {weight: number, value: T}[]): T => {
            const totalWeight = arr.reduce((sum, item) => sum + item.weight, 0);
            let random = Math.random() * totalWeight;
            for (const item of arr) {
                if (random < item.weight) return item.value;
                random -= item.weight;
            }
            return arr[arr.length - 1].value;
        }
    },
    phone: {
      number: (): string => `+7 (9${faker.string.numeric(2)}) ${faker.string.numeric(3)}-${faker.string.numeric(2)}-${faker.string.numeric(2)}`
    }
};

export const validation = {
    inn: (inn: string): string => {
        if (!inn) return "ИНН обязателен";
        if (!/^\d{10}$/.test(inn) && !/^\d{12}$/.test(inn)) {
            return "ИНН должен состоять из 10 или 12 цифр";
        }
        return "";
    },
    kpp: (kpp: string): string => {
        if (kpp && !/^\d{9}$/.test(kpp)) {
            return "КПП должен состоять из 9 цифр";
        }
        return "";
    },
    ogrn: (ogrn: string): string => {
        if (!ogrn) return "ОГРН обязателен";
        if (!/^\d{13}$/.test(ogrn)) {
            return "ОГРН должен состоять из 13 цифр";
        }
        return "";
    },
    vin: (vin: string): string => {
        if (vin && vin.length !== 17) {
            return "VIN должен состоять из 17 символов";
        }
        return "";
    },
    plateNumber: (plate: string): string => {
        if (!plate) return "Номерной знак обязателен";
        if (!/^[АВЕКМНОРСТУХ]\d{3}[АВЕКМНОРСТУХ]{2}\d{2,3}$/i.test(plate.replace(/\s/g, ''))) {
            return "Неверный формат (Пример: А123ВС45)";
        }
        return "";
    },
    pts: (series: string, number: string): string => {
        if (!series && !number) return "";
        if (!/^\d{2}[АВЕКМНОРСТУХ]{2}$/i.test(series.replace(/\s/g, ''))) return "Серия ПТС: 2 цифры, 2 буквы (АВЕКМНОРСТУХ)";
        if (!/^\d{6}$/.test(number.replace(/\s/g, ''))) return "Номер ПТС: 6 цифр";
        return "";
    },
    epts: (number: string): string => {
        if (number && !/^\d{15}$/.test(number.replace(/\s/g, ''))) {
            return "ЭПТС должен состоять из 15 цифр";
        }
        return "";
    },
    diagnosticCard: (number: string): string => {
        if (number && !/^\d{15,21}$/.test(number.replace(/\s/g, ''))) {
            return "Номер карты должен состоять из 15-21 цифры";
        }
        return "";
    },
    bankAccount: (account: string): string => {
        if (account && !/^\d{20}$/.test(account)) {
            return "Расчетный счет должен состоять из 20 цифр";
        }
        return "";
    },
    bankBik: (bik: string): string => {
        if (bik && !/^\d{9}$/.test(bik)) {
            return "БИК должен состоять из 9 цифр";
        }
        return "";
    },
    correspondentAccount: (account: string): string => {
        if (account && !/^\d{20}$/.test(account)) {
            return "Корр. счет должен состоять из 20 цифр";
        }
        return "";
    },
};